import { exec as node_exec } from 'child_process';

export default function exec(cmd: string, cwd?: string) {
	return new Promise<string>((resolve, reject) => {
		// Fix "stdout maxBuffer exceeded" error
		// See https://github.com/DefinitelyTyped/DefinitelyTyped/pull/26545#issuecomment-402274021
		const maxBuffer = 1024 * 1024 * 1024; // Max = 1 GiB, default is 200 KiB

		node_exec(cmd, {
			cwd,
			encoding: 'utf8',
			maxBuffer
		}, (error, stdout, stderr) => {
			if (error === null) {
				resolve(stdout.trim());
			} else {
				reject(new Error(stderr.trim()));
			}
		});
	});
}
