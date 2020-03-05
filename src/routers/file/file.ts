import { exec } from 'child_process';
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
import { IFile, IFileDoc, IMetaData, IOfficeFile } from './interfaces';

const logger = getLogger();

export const FILE_ENCODE = 'utf-8';
export const IMGREG = /[\S]+\.(jpg|gif|png|bmp|jpeg|svg|tif)$/i;
const client = new Client(config.minio);

const output = tmpdir();

const NAME_SPACE = 'file';

/**
 * 获取所有待上传的文件列表，包含压缩处理过的图片
 * @param req
 */
function getFiles(req: Request) {
	const files = [] as IFile[];
	const body = req.body as object;
	for (const name in body) {
		const file = body[name] as IFile & { fieldName: string; size: number };
		if (file.path && file.name && file.fieldName && file.type && file.size > 0) {
			files.push(file);
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
			// chunkSizeBytes:'number',
			// 文件的附加数据
			// contentType: file.type,
			originialfilename: encodeURIComponent(file.name)
			// aliases: ['string']
		};
		const id = uuid();
		if (file.path) {
			// 原文件，上传的时候有存储到文件系统中
			// 压缩处理后的文件
			const md5 = await client.fPutObject(NAME_SPACE, id, file.path, meta);
			const doc: IFileDoc = {
				contentType: file.type,
				id,
				md5,
				metadata: meta,
				name: file.name
			};
			return doc;
		}
		logger.error('Could not read file from file system:');
		throw new Error('Could not read file.');

	}));
}

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

const ms_type = /^application\/.*(ms|office).*/i;

/**
 * 上传office文件到mongodb数据库中,并转换为pdf和图片
 * @param req
 * @param db_info
 * @param standard
 */
export async function upload_office(req: Request, res: Response) {
	const office_files = getFiles(req);
	const toimg = (req.query as { toimg: boolean }).toimg !== undefined;
	// sudo apt-get install unoconv libreoffice-dev imagemagick
	const files = [] as IOfficeFile[];
	// convert to pdf
	for (const file of office_files) {
		const f: IOfficeFile = {
			origin: file
		};
		if (ms_type.test(file.type)) {
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
			const images = await convertPDF(file.path, { outputFormat: `${tmpdir}${sep}%s-%d` });
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

function to_pdf(res: Response, file_path: string, name: string) {
	return new Promise<IFile>((resolve, reject) => {
		const nm = `${parse(name).name}.pdf`;
		const full_path = `${parse(file_path).name}.pdf`;
		const pdf_file = join(output, full_path);
		exec(`libreoffice --headless --convert-to pdf --outdir ${output} '${file_path}'`, (err) => {
			if (err) {
				reject(err);

			} else {
				// _result: convert /home/taoqf/feidao/temp/test/test.docx -> /tmp/test.pdf using filter : writer_pdf_Export
				const file: IFile = {
					name: nm,
					path: pdf_file,
					type: 'application/pdf'
				};
				auto_clean(res, [file]);
				resolve(file);
			}
		});
	});
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
			const ranges = range_parser(Infinity, r, { combine: true });
			logger.debug(`parsed range:${JSON.stringify(ranges)}}`);
			if (ranges === -1) {
				throw new Error('Incorrect request!');
			} else if (ranges === -2) {
				throw new Error('Incorrect request!');
			} else if (ranges[0].end === Infinity) {
				logger.info(`method: getfile,id:${id} without range.`);
				return client.getObject(NAME_SPACE, id);
			} else {
				const range = ranges[0];
				if (!range || range.end === Infinity) {
					logger.info(`method: getfile,id:${id} without range[0-].`);
					return client.getObject(NAME_SPACE, id);
				}
				const start = ranges[0].start;
				const end = ranges[0].end;	// for lastest byte
				logger.debug(`${start}-${end}/${stat.size}`);
				if (end === Infinity) {
					// 0-
					res.setHeader('Content-Range', `bytes ${start}-/${stat.size}`);
					return client.getPartialObject(NAME_SPACE, id, start);
				}
				res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
				return client.getPartialObject(NAME_SPACE, id, end + 1);


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
		// contentType: file.type,
		originialfilename: encodeURIComponent(file.name)
		// aliases: ['string']
	};
	if (file.path) {
		// 原文件，上传的时候有存储到文件系统中
		// 压缩处理后的文件
		const md5 = await client.fPutObject(NAME_SPACE, id, file.path, meta);
		logger.info('reuploaded!');
		const doc: IFileDoc = {
			contentType: file.type,
			id,
			md5,
			metadata: meta,
			name: file.name
		};
		return doc;
	}
	logger.error('Could not read file from file system:');
	throw new Error('Could not read file.');

}
