// main.js
import { IPATool } from './src/ipa.js';
import { Store } from './src/client.js';
import { PurchaseClient } from './src/purchase.js';
import { queryHistory } from './src/history.js';
import { searchApp } from './src/search.js';
import readline from 'readline';

const ipaTool = new IPATool();
const purchaseClient = new PurchaseClient();

const RETRY_CONFIG = {
  MAX_LOGIN_ATTEMPTS: 3,
  MAX_PURCHASE_ATTEMPTS: 2,
  DELAY_BETWEEN_ATTEMPTS: 2000,
};

// ✅ 统一账号密码配置
const APP_CREDENTIALS = {
  APPLE_ID: 'Eric@gmail.com', //账号
  PASSWORD: '123456',  //账号密码
  CODE: '',  //双重验证码
};

const IS_QUERY_ONLY = process.argv.includes('--query-only') || process.argv.includes('-q');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractAppId(input) {
  if (!input) return null;
  input = String(input);  
  const patterns = [
    /\/id(\d+)/,
    /\/app\/[^/]+\/id(\d+)/,
    /itunes\.apple\.com\/[^/]+\/app\/[^/]+\/id(\d+)/,
    /apps\.apple\.com\/[^/]+\/app\/[^/]+\/id(\d+)/
  ];
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match && match[1]) return match[1];
  }
  if (/^\d+$/.test(input)) return input;
  return null;
}

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(question, ans => {
    rl.close();
    resolve(ans.trim());
  }));
}

// 显示历史版本
async function displayHistoryOnly(historyResult, appId, appName, bundleId) {
  if (!historyResult || historyResult.length === 0) {
    console.log("⚠️ 未找到历史版本");
    return;
  }
  let infoLog = `\n📦 App ID: ${appId} ｜ ${appName}`;
  if (bundleId) infoLog += ` ｜ bundleId: ${bundleId}`;
  console.log(infoLog);
  console.log("==========================================");
  console.log(`📋 共找到 ${historyResult.length} 个历史版本:`);
  historyResult.forEach((version, index) => {
    const isLatest = index === 0 ? "⭐ " : "  ";
    console.log(`${isLatest}[${index + 1}] ${version.version} (ID: ${version.versionid})`);
  });
  const latestVersion = historyResult[0];
  console.log("\n📊 版本信息:");
  console.log(`   最新版本: ${latestVersion.version} (ID: ${latestVersion.versionid})`);
  console.log(`   最早版本: ${historyResult[historyResult.length - 1].version}`);
}

// 选择历史版本
async function selectVersion(historyResult, currentVerId = '') {
  if (!historyResult || historyResult.length === 0) return '';
  if (currentVerId) {
    const selected = historyResult.find(v => v.versionid.toString() === currentVerId.toString());
    if (selected) return selected.versionid;
  }
  historyResult.forEach((v, i) => console.log(`🧩 [${i + 1}] ${v.version} ➡️ ${v.versionid}`));
  const ans = await ask("请输入要下载的版本序号、版本ID或版本号（回车默认最新）：");
  if (ans === '') return historyResult[0].versionid;
  if (!isNaN(ans) && parseInt(ans) > 0 && parseInt(ans) <= historyResult.length) return historyResult[parseInt(ans)-1].versionid;
  const foundById = historyResult.find(v => v.versionid.toString() === ans.toString());
  if (foundById) return foundById.versionid;
  const foundByVer = historyResult.find(v => v.version === ans);
  if (foundByVer) return foundByVer.versionid;
  console.log(`⚠️ 输入无效，默认使用最新版本`);
  return historyResult[0].versionid;
}

// 登录
async function handleLogin(config) {
  for (let i = 0; i < RETRY_CONFIG.MAX_LOGIN_ATTEMPTS; i++) {
    try {
      console.log("🔑 正在登录 Apple 账号...");
      const loginInfo = await Store.authenticate(config.APPLE_ID, config.PASSWORD, config.CODE);
      if (loginInfo._state === 'success') {
        console.log("✅ 登录成功");
        return loginInfo;
      } else {
        console.error(`❌ 登录失败 (第${i+1}次): ${loginInfo.customerMessage || loginInfo.failureType}`);
        if (i < RETRY_CONFIG.MAX_LOGIN_ATTEMPTS - 1) await delay(RETRY_CONFIG.DELAY_BETWEEN_ATTEMPTS);
      }
    } catch (err) {
      console.error(`❌ 登录异常 (第${i+1}次): ${err.message}`);
      if (i < RETRY_CONFIG.MAX_LOGIN_ATTEMPTS - 1) await delay(RETRY_CONFIG.DELAY_BETWEEN_ATTEMPTS);
    }
  }
  throw new Error("登录失败次数过多");
}

// 检查购买并下载
async function checkAndDownload(config, loginInfo) {
  try {
    const appInfo = await Store.download(config.APPID, config.appVerId || '', loginInfo);
    if (appInfo._state === 'success') {
      console.log("✅ 已购买，直接下载 IPA");
      await ipaTool.downipa(config);
      return true;
    }
  } catch (err) {
    console.log("🛒 应用未购买，进入购买流程...");
    console.log(`详情: ${err.message}`);
  }
  return false;
}

// 购买
async function handlePurchase(config, loginInfo) {
  for (let i = 0; i < RETRY_CONFIG.MAX_PURCHASE_ATTEMPTS; i++) {
    try {
      console.log(`🛒 购买 AppID: ${config.APPID}, versionId: ${config.appVerId || ''}`);
      const result = await purchaseClient.purchaseAppWithLoginInfo(config.APPID, { ...loginInfo, appleId: config.APPLE_ID });
      if (result.success) return true;
      if (i < RETRY_CONFIG.MAX_PURCHASE_ATTEMPTS - 1) await delay(RETRY_CONFIG.DELAY_BETWEEN_ATTEMPTS);
    } catch (err) {
      if (i < RETRY_CONFIG.MAX_PURCHASE_ATTEMPTS - 1) await delay(RETRY_CONFIG.DELAY_BETWEEN_ATTEMPTS);
    }
  }
  return false;
}

// 解析 AppID 或 URL
function getAppInfoFromArgs(input) {
  const appId = extractAppId(input);
  if (!appId) return null;
  return { appId, appVerId: '' };
}

// 主流程
async function main() {
  const args = process.argv.slice(2);

  // 搜索模式
  if (args.includes('-s') || args.includes('-search')) {
    const keywordIndex = args.findIndex(a => a === '-s' || a === '-search');
    const keyword = args[keywordIndex - 1];
    if (!keyword || keyword.startsWith('-')) {
      console.log("❌ 请提供搜索关键字，例如: node main.js 亚瑟 -s -c CN");
      return;
    }

    let country = 'US';
    const cIndex = args.findIndex(a => a === '-c' || a.startsWith('-country='));
    if (cIndex !== -1) {
      if (args[cIndex] === '-c' && args[cIndex + 1]) country = args[cIndex + 1].toUpperCase();
      else if (args[cIndex].startsWith('-country=')) country = args[cIndex].split('=')[1].toUpperCase();
    }

    console.log(`🔍 正在搜索 App: ${keyword} ｜ 国家: ${country}`);
    const apps = await searchApp(keyword, country, 20);
    if (!apps || apps.length === 0) return;

    // 选择 App
    apps.forEach((app, i) => console.log(`🧩 [${i + 1}] ${app.name} ｜ ID: ${app.id}`));
    const ans = await ask("选择序号或输入 AppID/URL（回车结束）：");
    if (!ans) return;
    let selectedApp;
    if (!isNaN(ans) && parseInt(ans) > 0 && parseInt(ans) <= apps.length) selectedApp = apps[parseInt(ans) - 1];
    else {
      const id = extractAppId(ans) || ans;
      selectedApp = apps.find(a => a.id.toString() === id.toString());
    }
    if (!selectedApp) return;

    console.log(`🔗 查询 AppID: ${selectedApp.id} ｜ 名称: ${selectedApp.name}`);
    await processApp(selectedApp.id);
    return;
  }

  // 直接输入 AppID/URL
  const appInput = args[0];
  await processApp(appInput);
}

// 处理 App 历史版本、购买、下载
async function processApp(input) {
  const appInfo = getAppInfoFromArgs(input);
  if (!appInfo) {
    console.log("❌ 无法解析 AppID");
    return;
  }
  const { appId, appVerId } = appInfo;
  console.log(`🔗 从输入解析 AppID: ${appId}`);

  let historyResult = [];
  let appName = "未知应用";
  let bundleId = null;

  try {
    const result = await queryHistory(appId, true);
    historyResult = result.versions || [];
    appName = result.name || "未知应用";
    bundleId = result.bundleId || null;

    console.log(`📦 App ID: ${appId} ｜ ${appName}${bundleId ? ' ｜ bundleId: '+bundleId : ''}`);

    if (IS_QUERY_ONLY) {
      await displayHistoryOnly(historyResult, appId, appName, bundleId);
      return;
    }
  } catch (err) {
    console.error(`❌ 查询历史版本失败: ${err.message}`);
    return;
  }

  const targetVerId = await selectVersion(historyResult, appVerId);

  const config = {
    APPID: appId,
    appVerId: targetVerId,
    ...APP_CREDENTIALS,
    path: './app'
  };

  const loginInfo = await handleLogin(config);
  const alreadyPurchased = await checkAndDownload(config, loginInfo);
  if (alreadyPurchased) return;

  const purchaseSuccess = await handlePurchase(config, loginInfo);
  if (!purchaseSuccess) {
    console.log("❌ 购买失败");
    return;
  }

  console.log("📥 开始下载 IPA...");
  await ipaTool.downipa(config);
  console.log(`✅ 下载完成，保存路径: ${config.path}`);
}

// 顶层调用
if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
