import { spawn as node_spawn } from 'child_process';
import bl from 'bl';

export default function spawn(command: string, params: string[]) {
	return new Promise<string>((res, rej) => {
		const child = node_spawn(command, params);

		child.stderr.pipe(new bl((err, data) => {
			if (err) {
				rej(err);
			} else {
				new Error(data.toString());
			}
		}));

		child.stdout.on('data', (chunk: Buffer) => {
			console.error('fffffffffff', chunk.toString());
		});

		child.stdout.pipe(new bl((err, data) => {
			if (err) {
				rej(err);
			} else {
				res(data.toString());
			}
		}));
	});
}

