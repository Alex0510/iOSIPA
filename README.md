  # 📦 IPATool 脚本说明    
代码参考来源灰佬源码

https://github.com/wf021325/ipatool.js

功能支持电脑及iOS手机--测试环境：windows github终端 iOS可用python3ide Node.js 18.16.1


该脚本用于 **查询 iOS 应用历史版本**、**搜索应用**、**自动购买并下载及下架软件 IPA**。  
支持输入 AppID 或 iTunes/Apple Store 链接。  

---

## 🚀 使用方法

### 1. 克隆项目并安装依赖
```bash
git clone <你的仓库地址>
cd ipatool.js
npm install
```

---

### 2. 配置 Apple ID
在 `main.js` 中找到以下配置：
```js
const APP_CREDENTIALS = {
  APPLE_ID: '你的AppleID邮箱',
  PASSWORD: '你的AppleID密码',
  CODE: '验证码（如需要）',
};
```

⚠️ 注意：使用真实 Apple ID，且需保证账号能登录 App Store。  

---

## 🛠 命令行参数速查表

| 参数/命令 | 说明 | 示例 |
|-----------|------|------|
| `<AppID或URL>` | 直接输入 AppID 或 App Store 链接 | `node main.js 414478124`<br>`node main.js https://apps.apple.com/us/app/wechat/id414478124` |
| `-q` | 只查询历史版本，不下载 | `node main.js 414478124 -q` |
| `-s` 或 `-search` | 搜索应用（需提供关键字） | `node main.js 微信 -s` |
| `-c <国家代码>` | 指定搜索国家，默认 US | `node main.js 微信 -s -c CN` |
| `-country=<国家代码>` | 同上，另一种写法 | `node main.js 微信 -s -country=JP` |

---

## 📋 查询历史版本 (只显示，不下载)
```bash
node main.js <AppID或URL> -q
```
示例：
```bash
node main.js 414478124 -q
node main.js https://apps.apple.com/us/app/wechat/id414478124 -q
```

---

## 🔍 搜索应用
```bash
node main.js <关键字> -s [-c 国家]
```

示例：
```bash
node main.js 微信 -s
node main.js 微信 -s -c CN
node main.js WeChat -s -c US
```

---

## 📥 下载应用
```bash
node main.js <AppID或URL>
```

示例：
```bash
node main.js 414478124
node main.js https://apps.apple.com/us/app/wechat/id414478124
```

---

## 📂 下载路径
下载的 IPA 默认保存到：
```
./app/
```

---

## 🧩 实际运行效果示例

### 1. 查询历史版本
```bash
$ node main.js 414478124 -q
🔗 从输入解析 AppID: 414478124
📦 App ID: 414478124 ｜ WeChat ｜ bundleId: com.tencent.xin
==========================================
📋 共找到 100 个历史版本:
⭐ [1] 8.0.45 (ID: 123456789)
   [2] 8.0.44 (ID: 123456788)
   [3] 8.0.43 (ID: 123456787)
   ...
📊 版本信息:
   最新版本: 8.0.45 (ID: 123456789)
   最早版本: 1.0.0
```

---

### 2. 搜索应用
```bash
$ node main.js 微信 -s -c CN
🔍 正在搜索 App: 微信 ｜ 国家: CN
🧩 [1] 微信 ｜ ID: 414478124
🧩 [2] 企业微信 ｜ ID: 1147396726
🧩 [3] 微信读书 ｜ ID: 952059546
选择序号或输入 AppID/URL（回车结束）：1
🔗 查询 AppID: 414478124 ｜ 名称: 微信
📦 App ID: 414478124 ｜ 微信 ｜ bundleId: com.tencent.xin
```

---

### 3. 下载应用
```bash
$ node main.js 414478124
🔗 从输入解析 AppID: 414478124
📦 App ID: 414478124 ｜ WeChat ｜ bundleId: com.tencent.xin
🧩 [1] 8.0.45 ➡️ 123456789
🧩 [2] 8.0.44 ➡️ 123456788
请输入要下载的版本序号、版本ID或版本号（回车默认最新）：1
🔑 正在登录 Apple 账号...
✅ 登录成功
🛒 应用未购买，进入购买流程...
📥 开始下载 IPA...
✅ 下载完成，保存路径: ./app/
```

---

## ⚠️ 注意事项
- 使用前请确认已安装 Node.js (推荐 v18+)  
- 脚本依赖 App Store 接口，可能会受地区/账号限制  
- 使用真实 Apple ID 可能触发安全验证，请确保能接收验证码  

---




