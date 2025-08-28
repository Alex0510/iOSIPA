// src/search.js
import fetch from 'node-fetch';

/**
 * 搜索 App
 * @param {string} term - 搜索关键字
 * @param {string} country - 国家代码 (默认 US)
 * @param {number} limit - 返回数量 (默认 20)
 */
export async function searchApp(term, country = 'US', limit = 20) {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${country}&entity=software&limit=${limit}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.resultCount) {
      console.log(`❌ 没有找到与 "${term}" 相关的 App (国家: ${country})`);
      return [];
    }

    const apps = data.results.map(app => ({
      id: app.trackId,
      name: app.trackName,
      url: app.trackViewUrl,
      bundleId: app.bundleId
    }));

    apps.forEach(app => {
      console.log(`📦 App ID: ${app.id} ｜ 名称: ${app.name}`);
      console.log(`🔗 URL: ${app.url}`);
      console.log(`🆔 Bundle ID: ${app.bundleId}`);
      console.log('-----------------------------------');
    });

    return apps;
  } catch (err) {
    console.error('❌ 搜索失败:', err.message);
    return [];
  }
}
