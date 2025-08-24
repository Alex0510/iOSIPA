// main.js (改进版)
import { IPATool } from './src/ipa.js';
import { Store } from './src/client.js';
import PurchaseClient from './src/purchase.js';

const ipaTool = new IPATool();
const purchaseClient = new PurchaseClient();

// 重试机制配置
const RETRY_CONFIG = {
  MAX_LOGIN_ATTEMPTS: 3,
  MAX_PURCHASE_ATTEMPTS: 2,
  DELAY_BETWEEN_ATTEMPTS: 2000, // 2秒
};

// 延迟函数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    const config = {
        path: './app',
        APPID: '6446335251', // 使用您要购买的应用ID
        appVerId: '', //为空下载最新版，输入ID则下载对应版本
        APPLE_ID: 'Eric@gmail.com', //appID账号
        PASSWORD: '12345678', //ID密码
        CODE: '' //二次验证码
    };

    try {
        console.log('------准备登录------');
        
        // 带重试机制的登录
        let loginInfo;
        let loginAttempts = 0;
        
        while (loginAttempts < RETRY_CONFIG.MAX_LOGIN_ATTEMPTS) {
            try {
                loginInfo = await Store.authenticate(config.APPLE_ID, config.PASSWORD, config.CODE);
                
                if (loginInfo._state === 'success') {
                    console.log(`登录成功: ${loginInfo.accountInfo?.address?.firstName || 'Unknown'} ${loginInfo.accountInfo?.address?.lastName || 'User'}`);
                    break;
                } else {
                    console.log(`登录尝试 ${loginAttempts + 1} 失败: ${loginInfo.customerMessage}`);
                    loginAttempts++;
                    
                    if (loginAttempts < RETRY_CONFIG.MAX_LOGIN_ATTEMPTS) {
                        console.log(`等待 ${RETRY_CONFIG.DELAY_BETWEEN_ATTEMPTS/1000} 秒后重试...`);
                        await delay(RETRY_CONFIG.DELAY_BETWEEN_ATTEMPTS);
                    }
                }
            } catch (error) {
                console.log(`登录尝试 ${loginAttempts + 1} 异常: ${error.message}`);
                loginAttempts++;
                
                if (loginAttempts >= RETRY_CONFIG.MAX_LOGIN_ATTEMPTS) {
                    throw error;
                }
                
                console.log(`等待 ${RETRY_CONFIG.DELAY_BETWEEN_ATTEMPTS/1000} 秒后重试...`);
                await delay(RETRY_CONFIG.DELAY_BETWEEN_ATTEMPTS);
            }
        }
        
        if (loginInfo._state !== 'success') {
            console.log('登录失败，达到最大尝试次数');
            return;
        }

        // 首先尝试直接下载（检查是否已经购买过）
        console.log('------检查应用是否已购买------');
        try {
            const appInfo = await Store.download(config.APPID, config.appVerId, loginInfo);
            
            if (appInfo._state === 'success') {
                console.log('✅ 应用已购买，直接下载...');
                await ipaTool.downipa(config);
                return;
            }
            
            // 如果下载失败，继续尝试购买
            console.log('应用未购买，开始购买流程...');
            
        } catch (downloadError) {
            console.log('应用未购买或需要购买，开始购买流程...');
        }

        // 购买应用
        console.log('------开始购买应用------');
        let purchaseResult;
        let purchaseAttempts = 0;
        
        while (purchaseAttempts < RETRY_CONFIG.MAX_PURCHASE_ATTEMPTS) {
            purchaseResult = await purchaseClient.purchaseAppWithLoginInfo(config.APPID, {
                ...loginInfo,
                appleId: config.APPLE_ID
            });

            if (purchaseResult.success) {
                break;
            }
            
            // 处理地区不匹配错误
            if (!purchaseResult.success && purchaseResult.needsRegionChange) {
                console.log('检测到地区不匹配，尝试自动调整...');
                purchaseResult = await purchaseClient.handleRegionMismatch(config.APPID, {
                    ...loginInfo,
                    appleId: config.APPLE_ID
                });
                
                if (purchaseResult.success) {
                    break;
                }
            }
            
            purchaseAttempts++;
            
            if (purchaseAttempts < RETRY_CONFIG.MAX_PURCHASE_ATTEMPTS) {
                console.log(`购买尝试 ${purchaseAttempts} 失败，等待后重试...`);
                await delay(RETRY_CONFIG.DELAY_BETWEEN_ATTEMPTS);
            }
        }

        if (!purchaseResult.success) {
            console.log(`❌ 购买失败: ${purchaseResult.message}`);
            
            if (purchaseResult.needsRegionChange) {
                console.log('💡 解决方案:');
                console.log('1. 登录Apple ID账户页面 (appleid.apple.com)');
                console.log('2. 检查并修改账户地区设置');
                console.log('3. 确保账户地区与要购买的应用所在地区一致');
                console.log('4. 重新运行程序');
            }
            return;
        }

        console.log('✅ 应用购买成功，开始下载...');

        // 购买成功后重新登录获取下载权限
        console.log('------重新登录获取下载权限------');
        const downloadLoginInfo = await Store.authenticate(config.APPLE_ID, config.PASSWORD, config.CODE);
        if (downloadLoginInfo._state !== 'success') {
            console.log(`重新登录失败：${downloadLoginInfo.customerMessage}`);
            return;
        }

        // 下载IPA文件
        await ipaTool.downipa(config);

    } catch (error) {
        console.error('程序执行出错:', error.message);
        
        // 特定错误处理
        if (error.message.includes('password')) {
            console.log('💡 密码相关错误提示:');
            console.log('1. 请确认Apple ID密码正确');
            console.log('2. 如果使用双重认证，请确保提供了正确的验证码');
            console.log('3. 如果最近更改过密码，请使用新密码');
        }
    }
}

// 执行主函数
await main();

