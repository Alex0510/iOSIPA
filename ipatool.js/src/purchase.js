// purchase.js
import plist from 'plist';
import fetch from 'node-fetch';
import { Store } from './client.js';

export class PurchaseClient {
    constructor() {
        this.headers = {
            'authority': 'buy.itunes.apple.com',
            'content-type': 'application/x-apple-plist',
            'accept': '*/*',
            'x-apple-store-front': '143441-1,32',
            'accept-encoding': 'gzip, deflate, br',
            'accept-language': 'zh-CN,zh-Hans;q=0.9',
            'user-agent': 'Configurator/2.15 (Macintosh; OS X 11.0.0; 16G29) AppleWebKit/2603.3.8'
        };
    }

    // 使用完整的登录信息执行购买
    async purchaseAppWithLoginInfo(appId, loginInfo) {
        try {
            console.log(`正在购买应用: ${appId}`);

            // 1. 构建完整的请求头
            const requestHeaders = {
                ...this.headers,
                'x-token': loginInfo.passwordToken,
                'x-dsid': loginInfo.dsPersonId,
                'icloud-dsid': loginInfo.dsPersonId,
                'cookie': this.buildCookies(loginInfo)
            };

            // 2. 构建正确的购买请求plist
            const plistData = this.buildCorrectPurchasePlist(appId, loginInfo);

            // 3. 发送购买请求
            const purchaseUrl = `https://buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/buyProduct`;
            
            const response = await fetch(purchaseUrl, {
                method: 'POST',
                headers: requestHeaders,
                body: plistData,
                timeout: 30000
            });

            // 4. 解析响应
            const responseText = await response.text();
            
            let result;
            try {
                result = plist.parse(responseText);
            } catch (parseError) {
                console.log('响应解析失败');
                throw new Error('响应解析失败');
            }

            // 5. 处理响应
            if (result.failureType) {
                const errorMessage = result.customerMessage || result.failureType;
                
                // 处理地区限制错误
                if (errorMessage.includes('Account Not In This Store')) {
                    throw new Error('账户地区与应用商店地区不匹配，请检查账户地区设置');
                }
                
                throw new Error(`购买失败: ${errorMessage}`);
            }

            // 检查是否购买成功
            if (result.songList && result.songList.length > 0) {
                console.log('✅ 应用购买成功');
                return {
                    success: true,
                    message: '购买成功',
                    details: result,
                    songList: result.songList
                };
            } else if (result.downloadKey) {
                console.log('✅ 应用已购买，准备下载');
                return {
                    success: true,
                    message: '应用已购买',
                    details: result
                };
            } else {
                return {
                    success: true,
                    message: '购买完成',
                    details: result
                };
            }

        } catch (error) {
            console.error('❌ 购买失败:', error.message);
            
            // 特殊处理地区错误
            if (error.message.includes('Account Not In This Store') || error.message.includes('地区不匹配')) {
                return {
                    success: false,
                    message: '账户地区不匹配：您的Apple ID地区与要购买的应用所在地区不一致',
                    needsRegionChange: true
                };
            }
            
            return {
                success: false,
                message: error.message
            };
        }
    }

    // 构建正确的购买请求plist数据
    buildCorrectPurchasePlist(appId, loginInfo) {
        const purchaseData = {
            appExtVrsId: "0",
            buyWithoutAuthorization: "true",
            guid: Store.guid,
            hasAskedToFulfillPreorder: "true",
            hasDoneAgeCheck: "true",
            needDiv: "0",
            origPage: `Software-${appId}`,
            origPageLocation: "Buy",
            price: "0",
            pricingParameters: "STDQ",
            productType: "C",
            salableAdamId: appId.toString()
        };

        return plist.build(purchaseData);
    }

    // 构建cookie字符串
    buildCookies(loginInfo) {
        const cookies = [
            `hsaccnt=1`,
            `mzf_in=${Math.floor(Math.random() * 100000)}`,
            `session-store-id=${this.generateSessionId()}`,
            `X-Dsid=${loginInfo.dsPersonId}`,
            `itspod=2`,
            `mz_at0_fr=${loginInfo.passwordToken}`,
            `mz_at0_fr-${loginInfo.dsPersonId}=${loginInfo.passwordToken}`,
            `mz_at_ssl-${loginInfo.dsPersonId}=${this.generateSecurityToken()}`,
            `pldfltcid=${this.generateGuid()}`,
            `wosid-lite=${this.generateSessionId().substring(0, 20)}`,
            `dsid=${loginInfo.dsPersonId}`
        ];

        return cookies.join('; ');
    }

    // 生成随机的session ID
    generateSessionId() {
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
    }

    // 生成安全token
    generateSecurityToken() {
        return 'AwUAAAIBAABOIAAAAAB' + Math.random().toString(36).substring(2, 30);
    }

    // 生成GUID
    generateGuid() {
        return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // 处理地区不匹配错误
    async handleRegionMismatch(appId, loginInfo) {
        console.log('检测到地区不匹配，尝试调整Store Front...');
        
        // 尝试不同的Store Front值
        const storeFronts = [
            '143465-1,32', // 中国
            '143441-1,32', // 美国
            '143463-1,32', // 香港
            '143462-1,32', // 日本
            '143470-1,32'  // 台湾
        ];

        for (const storeFront of storeFronts) {
            console.log(`尝试Store Front: ${storeFront}`);
            this.headers['x-apple-store-front'] = storeFront;
            
            try {
                const result = await this.purchaseAppWithLoginInfo(appId, loginInfo);
                if (result.success) {
                    return result;
                }
                
                if (!result.needsRegionChange) {
                    return result;
                }
            } catch (error) {
                console.log(`Store Front ${storeFront} 尝试失败`);
            }
        }

        return {
            success: false,
            message: '所有地区尝试都失败，请手动检查账户地区设置',
            needsRegionChange: true
        };
    }
}

export default PurchaseClient;