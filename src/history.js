import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import https from "https";

// ================= HTTPS Agent =================
// 忽略证书验证，可用于 MITM 抓包
const httpsAgent = new https.Agent({
  keepAlive: true,
  rejectUnauthorized: false,
  maxVersion: 'TLSv1.2',
});

// ================= 工具函数 =================

// 从 URL 中提取 App ID
function extractAppIdFromUrl(url) {
  try {
    const patterns = [
      /\/id(\d+)/,
      /\/app\/[^/]+\/id(\d+)/,
      /itunes\.apple\.com\/[^/]+\/app\/[^/]+\/id(\d+)/,
      /apps\.apple\.com\/[^/]+\/app\/[^/]+\/id(\d+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) return match[1];
    }
    if (/^\d+$/.test(url)) return url;
    return null;
  } catch {
    return null;
  }
}

// Apple 官方 API，获取 App 名称和 bundleId
async function fetchAppleInfo(appId) {
  try {
    const url = `https://itunes.apple.com/lookup?id=${appId}`;
    const resp = await fetch(url, {
      agent: httpsAgent,
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        'Accept': 'application/json, text/plain, */*'
      }
    });
    const data = await resp.json();
    if (data.resultCount > 0 && data.results[0]) {
      return {
        name: data.results[0].trackName || null,
        bundleId: data.results[0].bundleId || null
      };
    }
    return { name: null, bundleId: null };
  } catch {
    return { name: null, bundleId: null };
  }
}

// ================= 数据源 =================

// i4.cn
async function fetchI4(appId) {
  try {
    const searchUrl = `https://search-app-m.i4.cn/getAppList.xhtml?keyword=&model=iPhone&osversion=14.3&toolversion=100&pagesize=100&pageno=1`;
    const resp = await fetch(searchUrl, { agent: httpsAgent, timeout: 10000 });
    const data = await resp.json();

    if (!data || !data.app || !Array.isArray(data.app)) return { current: null, history: [], name: null, bundleId: null };

    const matchedApp = data.app.find(a => String(a.itemid) === appId);
    if (!matchedApp) return { current: null, history: [], name: null, bundleId: null };

    const detailUrl = `https://app4.i4.cn/appinfo.xhtml?appid=${matchedApp.id}&from=1`;
    const detailResp = await fetch(detailUrl, { agent: httpsAgent, timeout: 10000 });
    const info = await detailResp.json();

    const current = { version: info.Version, versionid: info.versionid };
    const history = (info.historyversion || []).map(v => ({
      version: v.Version,
      versionid: v.versionid
    }));

    return {
      current,
      history,
      name: info.Name || matchedApp.name,
      bundleId: info.bundleid || matchedApp.bundleid || null
    };
  } catch {
    return { current: null, history: [], name: null, bundleId: null };
  }
}

// bilin
async function fetchBilin(appId) {
  try {
    const url = `https://apis.bilin.eu.org/history/${appId}`;
    const resp = await fetch(url, { agent: httpsAgent, timeout: 10000 });
    const data = await resp.json();
    if (!data || !data.data) return [];
    return normalizeArray(data.data);
  } catch {
    return [];
  }
}

// timbrd
async function fetchTimbrd(appId) {
  try {
    const url = `https://api.timbrd.com/apple/app-version/index.php?id=${appId}`;
    const resp = await fetch(url, { agent: httpsAgent, timeout: 10000 });
    const data = await resp.json();
    if (!Array.isArray(data)) return [];
    return normalizeArray(data);
  } catch {
    return [];
  }
}

// agzy
async function fetchAgzy(appId) {
  try {
    const url = `https://app.agzy.cn/searchVersion?appid=${appId}`;
    const resp = await fetch(url, { agent: httpsAgent, timeout: 10000 });
    const data = await resp.json();
    if (!data || !data.data) return { versions: [], name: null, bundleId: null };
    return {
      versions: normalizeArray(data.data),
      name: data.name || null,
      bundleId: data.bundleId || null
    };
  } catch {
    return { versions: [], name: null, bundleId: null };
  }
}

// ================= 工具函数 =================

function normalizeArray(arr) {
  const result = [];
  if (!Array.isArray(arr)) return result;
  for (const item of arr) {
    try {
      const version = item.bundle_version || item.version;
      const versionid = item.external_identifier || item.versionid || item.versionId;
      if (version && versionid) result.push({ version, versionid });
    } catch {
      continue;
    }
  }
  return result;
}

function mergeDedup(listOfVersions) {
  const map = {};
  for (const item of listOfVersions) {
    if (!item || !item.version || !item.versionid) continue;
    const key = `${item.version}::${item.versionid}`;
    if (!map[key]) map[key] = { version: item.version, versionid: item.versionid };
  }
  return Object.values(map);
}

// ================= 主方法 =================

export async function queryHistory(input, returnName = false) {
  let appId = input;
  const extractedAppId = extractAppIdFromUrl(input);
  if (extractedAppId) appId = extractedAppId;
  else if (!/^\d+$/.test(input)) return returnName ? { versions: [], name: "未知应用", bundleId: null } : [];

  const [i4, bilin, timbrd, agzy, appleInfo] = await Promise.all([
    fetchI4(appId),
    fetchBilin(appId),
    fetchTimbrd(appId),
    fetchAgzy(appId),
    fetchAppleInfo(appId)
  ]);

  const allVersions = mergeDedup([
    ...(i4.history || []),
    ...bilin,
    ...timbrd,
    ...(agzy.versions || [])
  ]);

  // 确定应用名称和 bundleId
  let appName = i4.name || agzy.name || appleInfo.name || "未知应用";
  let bundleId = i4.bundleId || agzy.bundleId || appleInfo.bundleId || null;

  // === 输出日志 ===
  let log = `\n📦 App ID: ${appId} ｜ ${appName} ｜ bundleId: ${bundleId}\n`;
  if (extractedAppId) log += `🔗 原始输入: ${input}\n`;
  if (i4.current) log += `✅ 当前版本: ${i4.current.version} ➡️ ${i4.current.versionid}\n`;
  if (allVersions.length === 0) log += "⚠️ 未获取到任何历史版本\n";
  else {
    log += `📋 共找到 ${allVersions.length} 个历史版本:\n`;
    allVersions.forEach((v, i) => log += `🧩 [${i+1}] ${v.version} ➡️ ${v.versionid}\n`);
  }

  // 保存到文件
  const historyDir = path.resolve("history");
  if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });
  const safeName = appName.replace(/[\\/:*?"<>|]/g, "_");
  const filename = path.join(historyDir, `${appId}_${safeName}_history.txt`);
  fs.writeFileSync(filename, log, "utf-8");

  if (returnName) return { versions: allVersions, name: appName, bundleId };
  return allVersions;
}

// ================= CLI 支持 =================
if (process.argv.length > 2) {
  const input = process.argv[2];
  queryHistory(input, true).then(res => {
    
  });
}
