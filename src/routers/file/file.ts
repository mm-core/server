import { unlink } from 'fs';
import { tmpdir } from 'os';
import { join, parse, sep } from 'path';
import config from '@mmstudio/config';
import { Request, Response } from 'express';
import JSZip from 'jszip';
import { getLogger } from 'log4js';
import { Client } from 'minio';
import { convertPDF } from 'pdf2image';
import range_parser from 'range-parser';
import { v4 as uuid } from 'uuid';
import exec from './exec';
import { IFile, IFileDoc, IMetaData, IOfficeFile } from './interfaces';
import { converttomp4, get_stream_info, screenshot } from './vedio';

const logger = getLogger();

export const FILE_ENCODE = 'utf-8';
export const IMGREG = /[\S]+\.(jpg|gif|png|bmp|jpeg|svg|tif)$/i;
const client = new Client(config.minio);

const output = tmpdir();

const NAME_SPACE = 'file';
interface IFileTemp extends IFile {
	fieldName: string;
	size: number;
}

/**
 * 获取所有待上传的文件列表，包含压缩处理过的图片
 * @param req
 */
function getFiles(req: Request<Record<string, unknown>, unknown, Record<string, IFileTemp | Record<string, IFileTemp>>>) {
	const files = [] as IFile[];
	function isfile(file: IFileTemp | Record<string, IFileTemp>): file is IFileTemp {
		return Boolean(file.path && file.name && file.fieldName && file.type && file.size > 0);
	}
	const body = req.body;
	// as Record<string, IFileTemp | Record<string, IFileTemp>>;
	for (const name in body) {
		const file = body[name];
		if (isfile(file)) {
			files.push(file);
		} else if (typeof file === 'object') {
			for (const name in file) {
				const f = file[name];
				if (isfile(f)) {
					files.push(f);
				}
			}
		}
	}
	return files;
}

/**
 * 上传文件到mongodb数据库中
 * @param req
 * @param db_info
 * @param standard
 */
export async function upload(req: Request) {
	logger.debug('start uploading files');
	const files = getFiles(req);
	logger.debug('files:', files);
	const uploaded = await up(files);
	logger.info('upload all!');
	return uploaded;
}

async function up(files: IFile[]) {
	if (!await client.bucketExists(NAME_SPACE)) {
		await client.makeBucket(NAME_SPACE, config.minio.region || 'cn-north-1');
	}
	return Promise.all(files.map(async (file) => {
		const meta: IMetaData = {
			...file.meta,
			'content-type': file.type,
			originialfilename: encodeURIComponent(file.name)
		};
		const id = file.id || uuid();
		if (file.path) {
			// 原文件，上传的时候有存储到文件系统中
			// 压缩处理后的文件
			const md5 = await client.fPutObject(NAME_SPACE, id, file.path, meta);
			const doc: IFileDoc = {
				meta,
				contentType: file.type,
				id,
				md5,
				name: file.name
			};
			return doc;
		}
		logger.error('Could not read file from file system:');
		throw new Error('Could not read file.');
	}));
}

function replace_suffix(path: string, suffix: string) {
	return `${path.replace(/(.*)\..*$/, '$1')}.${suffix}`;
}

/**
 * 上传视频文件,并转换为mp4h264格式,同时截取一张视频封面
 */
export async function upload_video(req: Request) {
	const type = 'video/mp4';
	const files = await Promise.all(getFiles(req).map(async (file) => {
		let ret;
		// screenshot and duration
		const img = replace_suffix(file.path, 'jpg');
		await screenshot(file.path, img, 5);
		const [uploaded_image] = await up([{
			name: replace_suffix(file.name, 'jpg'),
			path: img,
			type: 'image/jpeg'
		}]);
		const [video, audio] = await get_stream_info(file.path);
		// !!! 如果上传的格式不是mp4格式，这里返回的值是原文件的多媒体信息
		file.meta = { screenshot: uploaded_image.id, video, audio, duration: video.duration } as Partial<IMetaData> as IMetaData;
		if (video.codec_name === 'h264') {
			if (file.type !== type) {
				file.type = type;
			}
			ret = (await up([file]))[0];
		} else {
			// do not wait convertion, just return file id, the video could not be download before convertion.
			const path = file.path;
			file.path = '';	// !!! 将这里置空，则该请求完毕后不删除该文件，等转换操作完成后再删
			const mp4_path = replace_suffix(path, 'mp4');
			const name = replace_suffix(file.name, 'mp4');
			const id = uuid();
			// eslint-disable-next-line @typescript-eslint/no-floating-promises
			(async (file) => {
				await converttomp4(path, mp4_path);
				const [video, audio] = await get_stream_info(mp4_path);
				const meta = { ...file.meta, video, audio, duration: video.duration } as IMetaData;
				await up([{
					meta,
					id,
					name,
					path: mp4_path,
					type
				}]);
				unlink(path, (e) => {
					logger.error(e);
				});
				unlink(mp4_path, (e) => {
					logger.error(e);
				});
				logger.info(`File is converted: id=${id}, name=${file.name}`);
			})(file);
			ret = {
				id,
				contentType: type,
				meta: {
					video,
					audio
				} as Partial<IMetaData>,
				md5: '',
				name
			} as IFileDoc;
		}
		ret.meta.screenshot = uploaded_image.id;
		return ret;
	}));
	logger.info('upload all!');
	return files;
}

function isofficefile(type: string) {
	/**
	 * office file content-type
	 *  doc	application/msword
	 * .dot	application/msword
	 * .docx	application/vnd.openxmlformats-officedocument.wordprocessingml.document
	 * .dotx	application/vnd.openxmlformats-officedocument.wordprocessingml.template
	 * .docm	application/vnd.ms-word.document.macroEnabled.12
	 * .dotm	application/vnd.ms-word.template.macroEnabled.12
	 * .xls	application/vnd.ms-excel
	 * .xlt	application/vnd.ms-excel
	 * .xla	application/vnd.ms-excel
	 * .xlsx	application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
	 * .xltx	application/vnd.openxmlformats-officedocument.spreadsheetml.template
	 * .xlsm	application/vnd.ms-excel.sheet.macroEnabled.12
	 * .xltm	application/vnd.ms-excel.template.macroEnabled.12
	 * .xlam	application/vnd.ms-excel.addin.macroEnabled.12
	 * .xlsb	application/vnd.ms-excel.sheet.binary.macroEnabled.12
	 * .ppt	application/vnd.ms-powerpoint
	 * .pot	application/vnd.ms-powerpoint
	 * .pps	application/vnd.ms-powerpoint
	 * .ppa	application/vnd.ms-powerpoint
	 * .pptx	application/vnd.openxmlformats-officedocument.presentationml.presentation
	 * .potx	application/vnd.openxmlformats-officedocument.presentationml.template
	 * .ppsx	application/vnd.openxmlformats-officedocument.presentationml.slideshow
	 * .ppam	application/vnd.ms-powerpoint.addin.macroEnabled.12
	 * .pptm	application/vnd.ms-powerpoint.presentation.macroEnabled.12
	 * .potm	application/vnd.ms-powerpoint.presentation.macroEnabled.12
	 * .ppsm	application/vnd.ms-powerpoint.slideshow.macroEnabled.12
	 */

	return /^application\/.*(ms|office).*/i.test(type);
}

/**
 * 上传office文件到,并转换为pdf和图片
 * @param req
 */
export async function upload_office(req: Request, res: Response) {
	const office_files = getFiles(req);
	const toimg = (req.query as unknown as { toimg: boolean }).toimg !== undefined;
	// sudo apt-get install unoconv libreoffice-dev imagemagick
	const files = [] as IOfficeFile[];
	// convert to pdf
	for (const file of office_files) {
		const f: IOfficeFile = {
			origin: file
		};
		if (isofficefile(file.type)) {
			// convert office file to pdf first
			const pdf = await to_pdf(res, file.path, file.name);
			f.pdf = pdf;
			if (toimg) {
				// then convert pdf to images
				const images = await convertPDF(pdf.path, { outputFormat: `${output}${sep}%s-%d` });
				f.images = images.map((img) => {
					return {
						name: img.name,
						path: img.path,
						type: 'application/pdf'
					};
				});
			}
		} else if (/^application\/pdf$/i.test(file.type) && toimg) {
			// just convert pdf to images
			const images = await convertPDF(file.path, { outputFormat: `${output}${sep}%s-%d` });
			f.images = images.map((img) => {
				return {
					name: img.name,
					path: img.path,
					type: 'application/pdf'
				};
			});
		} else {
			// do not convert file
		}
		files.push(f);
	}

	const fileInfo = await Promise.all(files.map(async ({ origin, pdf, images }) => {
		const result: {
			origin: IFileDoc;
			pdf?: IFileDoc;
			images?: IFileDoc[];
		} = {
			// upload origin file
			origin: (await up([origin]))[0]
		};
		// upload pdf file
		if (pdf) {
			result.pdf = (await up([pdf]))[0];
			// we do not need to wait until the file is deleted, it's in /tmp/
		}
		// upload image files
		if (images) {
			result.images = await up(images);
		}
		return result;
	}));
	logger.info('upload all!');
	return fileInfo;

}

async function to_pdf(res: Response, file_path: string, name: string) {
	const nm = `${parse(name).name}.pdf`;
	const full_path = `${parse(file_path).name}.pdf`;
	const pdf_file = join(output, full_path);
	await exec(`libreoffice --headless --convert-to pdf --outdir ${output} '${file_path}'`);
	// _result: convert /home/taoqf/feidao/temp/test/test.docx -> /tmp/test.pdf using filter : writer_pdf_Export
	const file: IFile = {
		name: nm,
		path: pdf_file,
		type: 'application/pdf'
	};
	auto_clean(res, [file]);
	return file;
}

function auto_clean(res: Response, files: IFile[]) {
	res.on('finish', () => {
		files.forEach((file) => {
			unlink(file.path, (e) => {
				logger.error(e);
			});
		});
	});
}

export async function read(res: Response, r: string, id: string) {
	if (id.includes(',')) {
		const ids = id.split(',').map((it) => {
			return it.trim();
		}).filter((it) => {
			return Boolean(it);
		});
		if (ids.length === 0) {
			return Promise.reject('id is empty!');
		}
		const downloadfiles = await Promise.all(ids.map(async (file_id) => {
			const stream = await client.getObject(NAME_SPACE, file_id);
			const stat = await client.statObject(NAME_SPACE, file_id);
			const meta = stat.metaData as IMetaData;
			return {
				md5: stat.etag,
				name: meta.originialfilename,
				stream
			};
		}));
		const pack = downloadfiles.reduce((pre, cur) => {
			pre.filenames.push(cur.name);
			pre.md5s.push(cur.md5);
			if (!pre.originialFileName) {
				pre.originialFileName = cur.name;
			}
			pre.zipfile.file(decodeURIComponent(cur.name), cur.stream as NodeJS.ReadableStream);
			return pre;
		}, {
			filenames: [] as string[],
			md5s: [] as string[],
			originialFileName: '',
			zipfile: new JSZip()
		});
		const originialilename = pack.originialFileName ? `${pack.originialFileName}等${downloadfiles.length}个文件.zip` : 'pack.zip';
		const name = encodeURIComponent(originialilename);
		return {
			contentType: 'application/x-zip-compressed',
			md5: pack.md5s.join(','),
			name,
			stream: pack.zipfile.generateNodeStream()
		};
	}
	const stat = await client.statObject(NAME_SPACE, id);
	const meta = stat.metaData as IMetaData;
	const stream = await (() => {
		if (r) {
			logger.info(`method: getfile,id:${id} with range:${r}`);
			const ranges = range_parser(stat.size, r, { combine: true });
			logger.debug(`parsed range:${JSON.stringify(ranges)}`);
			if (ranges === -1) {
				res.set('Content-Range', `*/${stat.size}`);
				res.status(416);
				throw new Error('Incorrect request!');
			} else if (ranges === -2) {
				throw new Error('Incorrect request!');
			} else {
				const range = ranges[0];
				const start = range.start;
				const end = range.end;	// for lastest byte
				res.status(206);
				res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
				res.setHeader('Content-Length', end + 1 - start);
				return client.getPartialObject(NAME_SPACE, id, start, end - start + 1);
			}
		} else {
			logger.info(`method: getfile,id:${id} without range.`);
			return client.getObject(NAME_SPACE, id);
		}
	})();
	return {
		contentType: meta['content-type'],
		md5: stat.etag,
		name: meta.originialfilename,
		stream
	};

}

export function del(ids: string[]) {
	return client.removeObjects(NAME_SPACE, ids);
}

export async function reupload(req: Request, id: string) {
	logger.debug('start uploading files');
	const files = getFiles(req);
	logger.debug('file:', files, id);
	if (files.length !== 1) {
		throw new Error('Could not replace more than 1 file.');
	}
	const file = files[0];
	if (!await client.bucketExists(NAME_SPACE)) {
		await client.makeBucket(NAME_SPACE, config.minio.region || 'cn-north-1');
	}
	const meta: IMetaData = {
		// chunkSizeBytes:'number',
		// 文件的附加数据
		'content-type': file.type,
		originialfilename: encodeURIComponent(file.name)
		// aliases: ['string']
	};
	if (file.path) {
		// 原文件，上传的时候有存储到文件系统中
		// 压缩处理后的文件
		const md5 = await client.fPutObject(NAME_SPACE, id, file.path, meta);
		logger.info('reuploaded!');
		const doc: IFileDoc = {
			meta,
			contentType: file.type,
			id,
			md5,
			name: file.name
		};
		return doc;
	}
	logger.error('Could not read file from file system:');
	throw new Error('Could not read file.');
}
