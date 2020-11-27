import ff from 'ffprobe';

export interface IMetaData {
	originialfilename: string;
	'content-type': string;
	video?: ff.FFProbeStream;
	audio?: ff.FFProbeStream;
	screenshot?: string;
	duration?: number;
}

export interface IFileDoc {
	id: string;
	contentType: string;
	name: string;
	md5: string;
	meta: IMetaData;
}

export interface IOfficeFile {
	origin: IFile;
	pdf?: IFile;
	images?: IFile[];
}

export interface IFile {
	id?: string;
	name: string;
	path: string;
	type: string;
	meta?: IMetaData;
}
