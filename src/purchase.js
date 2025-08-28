import plist from 'plist';
import fetch from 'node-fetch';
import { Store } from './client.js';

export class PurchaseClient {
    constructor() {
        this.headers = {
            'authority': 'buy.itunes.apple.com',
            'content-type': 'application/x-apple-plist',
            'accept': '*/*',
            'x-apple-store-front': '143441-1,32', // 默认值，会被 loginInfo.storeFront 覆盖
            'accept-encoding': 'gzip, deflate, br',
            'accept-language': 'zh-CN,zh-Hans;q=0.9',
            'user-agent': 'Configurator/2.15 (Macintosh; OS X 11.0.0; 16G29) AppleWebKit/2603.3.8'
        };
    }

    async purchaseAppWithLoginInfo(appId, loginInfo) {
        try {
            console.log(`🛒 购买 AppID: ${appId}`);

            // 使用登录返回的 storeFront
            const storeFront = loginInfo.storeFront || '143441-1,32';
            this.headers['x-apple-store-front'] = storeFront;

            const requestHeaders = {
                ...this.headers,
                'x-token': loginInfo.passwordToken,
                'x-dsid': loginInfo.dsPersonId,
                'icloud-dsid': loginInfo.dsPersonId,
                'cookie': this.buildCookies(loginInfo)
            };

            const plistData = this.buildCorrectPurchasePlist(appId, loginInfo);
            const purchaseUrl = `https://buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/buyProduct`;

            const response = await fetch(purchaseUrl, {
                method: 'POST',
                headers: requestHeaders,
                body: plistData,
                timeout: 30000
            });

            const responseText = await response.text();
            let result;
            try { result = plist.parse(responseText); } 
            catch { throw new Error('响应解析失败'); }

            if (result.failureType) {
                const errorMessage = result.customerMessage || result.failureType;
                if (errorMessage.includes('Account Not In This Store')) {
                    throw new Error('账户地区与应用商店地区不匹配，请检查账户地区设置');
                }
                throw new Error(`购买失败: ${errorMessage}`);
            }

            if (result.songList && result.songList.length > 0) {
                console.log('✅ 应用购买成功');
                return { success: true, message: '购买成功', details: result, songList: result.songList };
            } else if (result.downloadKey) {
                console.log('✅ 应用已购买，准备下载');
                return { success: true, message: '应用已购买', details: result };
            } else {
                return { success: true, message: '购买完成', details: result };
            }

        } catch (error) {
            console.error('❌ 购买失败:', error.message);
            if (error.message.includes('Account Not In This Store') || error.message.includes('地区不匹配')) {
                return { success: false, message: '账户地区不匹配', needsRegionChange: true };
            }
            return { success: false, message: error.message };
        }
    }

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

    generateSessionId() { return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15); }
    generateSecurityToken() { return 'AwUAAAIBAABOIAAAAAB' + Math.random().toString(36).substring(2, 30); }
    generateGuid() { return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => ((Math.random() * 16 | 0) & (c === 'x' ? 0xF : 0x3 | 0x8)).toString(16)); }

    async handleRegionMismatch(appId, loginInfo) {
        console.log('检测到地区不匹配，尝试调整 StoreFront...');
        const storeFronts = ['143465-1,32','143441-1,32','143463-1,32','143462-1,32','143470-1,32'];
        for (const sf of storeFronts) {
            console.log(`尝试 StoreFront: ${sf}`);
            this.headers['x-apple-store-front'] = sf;
            try {
                const result = await this.purchaseAppWithLoginInfo(appId, loginInfo);
                if (result.success) return result;
                if (!result.needsRegionChange) return result;
            } catch {}
        }
        return { success: false, message: '所有地区尝试失败，请手动检查账户地区设置', needsRegionChange: true };
    }
}

export default PurchaseClient;
