import ffprobe from 'ffprobe';
import ffprobe_static from 'ffprobe-static';
import exec from './exec';

export async function get_stream_info(path: string) {
	const info = await ffprobe(path, { path: ffprobe_static.path });
	return info.streams;
	// apt install ffprobe
	// // return exec(`ffprobe -show_streams -print_format json ${path}`);
	// return spawn('ffprobe', ['-show_data', '-show_streams', '-print_format', 'json', path]);
}

export function converttomp4(src: string, dest: string) {
	// apt install ffmpeg libx264-155
	return exec(`ffmpeg -i ${src} -vcodec h264 ${dest}
`);
}

export function screenshot(src: string, dest: string, offset: number) {
	// apt install ffmpeg libx264-155
	// 单位：秒
	return exec(`ffmpeg -i ${src} -ss ${offset} -vframes 1 ${dest}
`);
}
