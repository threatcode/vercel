import { forkDevServer, readMessage } from '../src/fork-dev-server';
import { resolve, extname } from 'path';
import fetch from 'node-fetch';

jest.setTimeout(10 * 1000);

function testForkDevServer(entrypoint: string) {
  const ext = extname(entrypoint);
  const isTypeScript = ext === '.ts';
  const isEsm = ext === '.mjs';
  return forkDevServer({
    maybeTranspile: true,
    config: {},
    isEsm,
    isTypeScript,
    meta: {},
    require_: require,
    tsConfig: undefined,
    workPath: resolve(__dirname, './dev-fixtures'),
    entrypoint,
    devServerPath: resolve(__dirname, '../dist/dev-server.js'),
  });
}

test('runs a mjs endpoint', async () => {
  const child = testForkDevServer('./esm-module.mjs');

  try {
    const result = await readMessage(child);
    if (result.state !== 'message') {
      throw new Error('Exited. error: ' + JSON.stringify(result.value));
    }

    const response = await fetch(
      `http://localhost:${result.value.port}/api/hello`
    );
    expect({
      status: response.status,
      headers: response.headers.raw(),
      text: await response.text(),
    }).toEqual({
      status: 200,
      headers: expect.objectContaining({
        'x-hello': ['world'],
      }),
      text: 'Hello, world!',
    });
  } finally {
    child.kill(9);
  }
});

test('runs a esm typescript endpoint', async () => {
  const child = testForkDevServer('./esm-module.ts');

  try {
    const result = await readMessage(child);
    if (result.state !== 'message') {
      throw new Error('Exited. error: ' + JSON.stringify(result.value));
    }

    const response = await fetch(
      `http://localhost:${result.value.port}/api/hello`
    );
    expect({
      status: response.status,
      headers: response.headers.raw(),
      text: await response.text(),
    }).toEqual({
      status: 200,
      headers: expect.objectContaining({
        'x-hello': ['world'],
      }),
      text: 'Hello, world!',
    });
  } finally {
    child.kill(9);
  }
});
