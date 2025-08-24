// history.js
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

// ================= 历史版本查询 =================

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
      if (match && match[1]) {
        return match[1];
      }
    }
    if (/^\d+$/.test(url)) {
      return url;
    }
    return null;
  } catch {
    return null;
  }
}

// i4.cn
async function fetchI4(appId) {
  try {
    const searchUrl = `https://search-app-m.i4.cn/getAppList.xhtml?keyword=&model=iPhone&osversion=14.3&toolversion=100&pagesize=100&pageno=1`;
    const resp = await fetch(searchUrl, { timeout: 10000 });
    const data = await resp.json();

    let matchedApp = data.app.find(a => String(a.itemid) === appId);
    if (!matchedApp) {
      return { current: null, history: [], name: null };
    }

    const detailUrl = `https://app4.i4.cn/appinfo.xhtml?appid=${matchedApp.id}&from=1`;
    const detailResp = await fetch(detailUrl, { timeout: 10000 });
    const info = await detailResp.json();

    const current = { version: info.Version, versionid: info.versionid };
    const history = (info.historyversion || []).map(v => ({
      version: v.Version,
      versionid: v.versionid
    }));

    return { current, history, name: info.Name || matchedApp.name };
  } catch {
    return { current: null, history: [], name: null };
  }
}

// bilin
async function fetchBilin(appId) {
  try {
    const url = `https://apis.bilin.eu.org/history/${appId}`;
    const resp = await fetch(url, { timeout: 10000 });
    const data = await resp.json();
    return normalizeArray(data.data);
  } catch {
    return [];
  }
}

// timbrd
async function fetchTimbrd(appId) {
  try {
    const url = `https://api.timbrd.com/apple/app-version/index.php?id=${appId}`;
    const resp = await fetch(url, { timeout: 10000 });
    const data = await resp.json();
    return normalizeArray(data);
  } catch {
    return [];
  }
}

// agzy
async function fetchAgzy(appId) {
  try {
    const url = `https://app.agzy.cn/searchVersion?appid=${appId}`;
    const resp = await fetch(url, { timeout: 10000 });
    const data = await resp.json();

    return {
      versions: normalizeArray(data.data),
      name: data.name || null
    };
  } catch {
    return { versions: [], name: null };
  }
}

function normalizeArray(arr) {
  const result = [];
  for (const item of arr || []) {
    const version = item.bundle_version || item.version;
    const versionid = item.external_identifier || item.versionid || item.versionId;
    if (version && versionid) {
      result.push({ version, versionid });
    }
  }
  return result;
}

function mergeDedup(listOfVersions) {
  const map = {};
  for (const item of listOfVersions) {
    if (!item.version || !item.versionid) continue;
    const key = `${item.version}::${item.versionid}`;
    if (!map[key]) map[key] = { version: item.version, versionid: item.versionid };
  }
  return Object.values(map);
}

// 主方法
export async function queryHistory(input) {
  let appId = input;
  const extractedAppId = extractAppIdFromUrl(input);
  
  if (extractedAppId) {
    console.log(`🔗 从 URL 中提取到 App ID: ${extractedAppId}`);
    appId = extractedAppId;
  } else if (!/^\d+$/.test(input)) {
    console.log(`❌ 输入格式错误: ${input}`);
    console.log("💡 请提供有效的 App ID 或 App Store URL");
    return;
  }
  
  console.log(`🔍 开始查询 App ID: ${appId} 的历史版本...`);
  
  const i4 = await fetchI4(appId);
  const bilin = await fetchBilin(appId);
  const timbrd = await fetchTimbrd(appId);
  const agzy = await fetchAgzy(appId);

  const allVersions = mergeDedup([
    ...(i4.history || []),
    ...bilin,
    ...timbrd,
    ...(agzy.versions || [])
  ]);

  // === 确定软件名称 ===
  const appName = i4.name || agzy.name || "未知应用";

  // === 输出日志 ===
  let log = `\n📦 App ID: ${appId} ｜ ${appName}\n`;

  if (extractedAppId) {
    log += `🔗 原始输入: ${input}\n`;
  }

  if (i4.current) {
    log += `✅ 当前版本: ${i4.current.version} ➡️ ${i4.current.versionid}\n`;
  }
  
  if (allVersions.length === 0) {
    log += "⚠️ 未获取到任何历史版本\n";
  } else {
    log += `📋 共找到 ${allVersions.length} 个历史版本:\n`;
    allVersions.forEach((v, i) => {
      log += `🧩 [${i+1}] ${v.version} ➡️ ${v.versionid}\n`;
    });
  }

  console.log(log);

  // 创建 history 文件夹
  const historyDir = path.resolve("history");
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir);
  }

  // 保存到文件
  const safeName = appName.replace(/[\\/:*?"<>|]/g, "_");
  const filename = path.join(historyDir, `${appId}_${safeName}_history.txt`);
  fs.writeFileSync(filename, log, "utf-8");
  console.log(`📄 日志已写入 ${filename}`);
}

// 支持命令行直接运行
if (process.argv.length > 2) {
  const input = process.argv[2];
  queryHistory(input);
} 