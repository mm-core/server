import { createHash } from 'crypto';
import config from '@mmstudio/config';
import { Router } from 'express';
import { getLogger } from 'log4js';
import fetch from 'node-fetch';

const logger = getLogger();

interface IQuery {
	signature: string;
	timestamp: string;
	nonce: string;
	echostr: string;
	wxuserinfo: string;
}

export default function wx(router: Router) {
	interface IWxuserinfo {
		openid: string;		// 用户的唯一标识
		nickname?: string;	// 用户昵称
		sex?: '1' | '2';		// 用户的性别，值为1时是男性，值为2时是女性，值为0时是未知
		province?: string;		// 用户个人资料填写的省份
		city?: string;			// 普通用户个人资料填写的城市
		country?: string;		// 国家，如中国为CN
		headimgurl?: string;	// 用户头像，最后一个数值代表正方形头像大小（有0、46、64、96、132数值可选，0代表640*640正方形头像），用户没有头像时该项为空。若用户更换头像，原有头像URL将失效。
		privilege?: string[];	// 用户特权信息，json 数组，如微信沃卡用户为（chinaunicom）
		unionid?: string;		// 只有在用户将公众号绑定到微信开放平台帐号后，才会出现该字段。
	}
	interface ICookies {
		wxuserinfo: string;
	}
	interface IBody {
		wxuserinfo: IWxuserinfo;
	}
	const { wx: { appid, appsecret, token, getopenid, getuserinfo } } = config;
	router.get('/wx-validate', (req, res) => {
		const { signature, timestamp, nonce, echostr } = req.query as IQuery;
		logger.info(`wx params: signature=${signature},timestamp=${timestamp},nonce=${nonce}, echostr=${echostr}`);
		const content = [timestamp, nonce, token].sort().join('');
		const data = createHash('sha1').update(content).digest('hex');
		logger.info(`sha1=${data}`);
		if (data === signature) {
			res.send(echostr);
		} else {
			res.status(500).end();
		}
	});
	if (getopenid || getuserinfo) {
		router.use((req, _res, next) => {
			const cookies = req.cookies as ICookies;
			logger.info('requet cookies:', JSON.stringify(req.cookies));
			if (cookies.wxuserinfo) {
				const wxuserinfo = JSON.parse(cookies.wxuserinfo) as IWxuserinfo;
				if (req.body) {
					(req.body as IBody).wxuserinfo = wxuserinfo;
				} else if (req.query) {
					(req.query as IBody).wxuserinfo = wxuserinfo;
				}
			}
			next();
		});
		router.get('/*.html', async (req, res, next) => {
			logger.info('requet headers:', JSON.stringify(req.headers));
			const query = req.query as IBody;
			if (!query.wxuserinfo) {
				const { code } = query.wxuserinfo;
				if (!code) {
					const scope = getuserinfo ? 'snsapi_userinfo' : 'snsapi_base';
					const url = `${req.protocol}://${req.headers.host}${req.url}`;
					const redirect = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appid}&redirect_uri=${encodeURIComponent(url)}&response_type=code&scope=${scope}#wechat_redirect`;
					logger.info(`Request:${url}, redirect to weixin to get code`);
					res.redirect(302, redirect);
				} else {
					try {
						const access = await request<{
							access_token: string;
							expires_in: number;
							refresh_token: string;
							openid: string;
							scope: string;
						}>(`https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appid}&secret=${appsecret}&code=${code}&grant_type=authorization_code`, 'GET');
						logger.info(`Request with code:${req.url}, code = ${code}`);
						const userinfo = await (() => {
							if (getuserinfo) {
								// get user info
								return request<IWxuserinfo>(`https://api.weixin.qq.com/sns/userinfo?access_token=${access.access_token}&openid=${access.openid}&lang=zh_CN`, 'GET');
							}
							const ui: IWxuserinfo = {
								openid: access.openid
							};
							return ui;
						})();
						query.wxuserinfo = userinfo;
						const wxuserinfo = JSON.stringify(userinfo);
						logger.info(`wxuserinfo:${wxuserinfo}`);
						res.cookie('wxuserinfo', wxuserinfo, {
							httpOnly: true
						});
						next();
					} catch (e) {
						const err = e as Error;
						logger.error(`Exception thrown while getting user info, message=${err.message}`);
						res.status(500).send(err.message);
					}
				}
			}
		});
	}
	return router;
}

async function request<T>(url: string, method: 'GET' | 'POST') {
	const result = await fetch(url, {
		method
	});
	if (result.status >= 200 && result.status < 400) {
		const data = await result.json() as T & { errcode: number; errmsg: string };
		if (data.errcode && data.errmsg) {
			logger.error(`Exception thrown,url=${url},code=${data.errcode}, msg=${data.errmsg}`);
			throw new Error(data.errmsg);
		} else {
			return data as T;
		}
	} else {
		throw new Error(result.statusText);
	}
}
