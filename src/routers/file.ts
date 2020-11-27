import { Request, Router } from 'express';
import { getLogger } from 'log4js';
import { del, read, reupload, upload, upload_office, upload_video } from './file/file';

const logger = getLogger();

export default function file(router: Router) {
	router_upload(router);
	router_upload_office(router);
	router_upload_video(router);
	router_download(router);
	router_del(router);
	router_replace(router);
}

/**
 * 将视频转换为mp4，需要本机安装 ffmpeg 以及对应的解码库
 */
function router_upload_video(router: Router) {
	router.post('/:fsweb?/upload-mp4h264/', async (req, res) => {
		logger.debug('method: upload-video');
		try {
			const result = await upload_video(req);
			logger.debug('upload success result:', result);
			res.status(200).json(result);
		} catch (e) {
			const er = e as Error;
			const err = er.message || er.toString();
			logger.error('upload fail!', err);
			res.status(500).send(err);
		}
	});
}

/**
 * 文件上传
 * 如果是图片文件，则根据数据库配置的压缩策略对图片进行压缩上传处理
 * 如果是非图片，则只进行上传不进行文件处理
 */
function router_upload(router: Router) {
	router.post('/:fsweb?/upload', async (req, res) => {
		logger.debug('method: upload');
		try {
			const result = await upload(req);
			logger.debug('upload success result:', result);
			res.status(200).json(result);
		} catch (e) {
			const er = e as Error;
			const err = er.message || er.toString();
			logger.error('upload fail!', err);
			res.status(500).send(err);
		}
	});
}

/**
 * office文件上传,上传完成后转换为ppt文档和图片
 */
function router_upload_office(router: Router) {
	router.post('/:fsweb?/upload-office/', async (req, res) => {
		logger.debug('method: upload-office');
		try {
			const result = await upload_office(req, res);
			logger.debug('upload success result:', result);
			res.status(200).json(result);
		} catch (e) {
			const er = e as Error;
			const err = er.message || er.toString();
			logger.error('upload fail!', err);
			res.status(500).send(err);
		}
	});
}

/**
 * 文件下载，预览
 */
function router_download(router: Router) {
	router.use('/:fsweb?/getfile', (_req, res, next) => {
		res.setHeader('Accept-Ranges', 'bytes');
		next();
	});
	router.get('/:fsweb?/getfile', async (req, res) => {
		logger.debug('**********************************************');
		logger.debug('url:', req.url);
		const id = get_param(req, 'id');
		if (!id) {
			logger.debug('method: getfile,id is empty');
			res.status(500).send('id can not be empty!');
			return;
		}
		logger.debug('Request headers:', JSON.stringify(req.headers));
		// Etag标识
		const none_match = req.header('if-none-match');
		logger.debug(`method: getfile,file_id:${id}`);
		try {
			const r = req.header('range');
			const result = await read(res, r!, id);
			const filename = result.name;
			const is_download = get_param(req, 'download');	// 是否强制下载文件
			if (is_download !== undefined) {
				logger.debug(`method: getfile,download: true,file_name:${filename}`);
				if (/.+\..+/.test(is_download)) {
					res.setHeader('Content-Disposition', `attachment; filename=${is_download}`);
				} else {
					res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
				}
			} else {
				res.setHeader('Content-Disposition', `inline; filename=${filename}`);
			}
			res.setHeader('Content-Type', result.contentType);
			logger.debug(`getfile success,filename:${filename}, ${result.contentType}`);
			// 增加Etag判断文件是否有变动
			const etag = `W/"${result.md5}"`;
			res.setHeader('Etag', etag);
			if (none_match && (none_match === etag)) {
				// 文件没有变动直接返回304使用本地缓存
				res.status(304).end();
			} else {
				result.stream.pipe(res);
			}
		} catch (e) {
			const er = e as Error;
			const err = er.message || er.toString();
			logger.error('read file fail!', err);
			res.status(500).send(err);
		}
	});
}

function router_del(router: Router) {
	router.post('/:fsweb?/delfile', async (req, res) => {
		const delfile_name = get_param(req, 'delfile_name') || get_param(req, 'id') || (req.body as { id: string | string[] }).id;
		const file_name = Array.isArray(delfile_name) ? delfile_name.join(',') : delfile_name;
		if (!file_name) {
			logger.debug('method: delfile,msg: delfile_name or id all empty!');
			res.status(500).send('id can not all empty!');
			return;
		}
		if (typeof file_name !== 'string') {
			logger.debug('method: delfile,msg: delfile_name or id must be a string!');
			res.status(500).send('delfile_name or id must be a string!');
			return;
		}
		logger.warn(`method: delfile,delfile_name: ${file_name}`);
		try {
			const files = file_name.split(',');
			await del(files);
			const n = files.length;
			logger.debug(`method: delfile,result: success,deflfile_name: ${file_name},${n} file(s) has(have) been deleted.`);
			res.status(200).json({ code: 1, code_msg: '删除成功！' });
		} catch (e) {
			const er = e as Error;
			const err = er.message || er.toString();
			logger.error('del file fail!', err);
			res.status(500).send(err);
		}
	});
}

/**
 * 文件替换，替换完以后filename保持和原文件一致，其他字段会更新
 */
function router_replace(router: Router) {
	router.post('/:fsweb?/reupload', async (req, res) => {
		const delfile_name = get_param(req, 'delfile_name') || get_param(req, 'id');
		if (/\.|,|\*|\+|\?/.test(delfile_name)) {
			logger.error('method: reupload,msg: id could not be a regexp!');
			res.status(500).send('参数id不能为正则表达式');
			return;
		}
		if (!delfile_name) {
			logger.debug('method: reupload,msg: delfile_name or id all empty!');
			res.status(500).send('delfile_name or id can not all empty!');
			return;
		}
		logger.debug(`method: getfile,delfile_name: ${delfile_name}`);

		try {
			const result = await reupload(req, delfile_name);

			logger.debug('reupload file success', result);
			res.status(200).json(result);
		} catch (e) {
			const er = e as Error;
			const err = er.message || er.toString();
			logger.error('file reupload fail:', err);
			res.status(500).send(err);
		}
	});
}

function get_param(req: Request, name: string) {
	return (req.query as { [name: string]: string })[name];
}
