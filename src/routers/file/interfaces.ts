export interface IMetaData {
	originialfilename: string;
	'content-type': string;
}

export interface IFileDoc {
	id: string;
	contentType: string;
	name: string;
	md5: string;
}

export interface IOfficeFile {
	origin: IFile;
	pdf?: IFile;
	images?: IFile[];
}

export interface IFile {
	name: string;
	path: string;
	type: string;
}
