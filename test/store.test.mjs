import { defaults } from '../src/store.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { projectRoot } from '../src/paths.mjs';

test('new installations use platform defaults with no chats; both saved modes survive reopening', async () => {
  const parent = path.join(projectRoot, '.runtime', 'tests'); await fs.mkdir(parent, { recursive: true });
  const home = await fs.mkdtemp(path.join(parent, 'defaults-'));
  const store = await new Store(home).open();
  assert.equal(store.data.config.observeOnly, defaults.observeOnly); assert.deepEqual(store.data.watches, {});
  for (const observeOnly of [false, true]) {
    store.data.config.observeOnly = observeOnly; store.data.config.enabled = false; await store.save();
    const reopened = await new Store(home).open();
    assert.equal(reopened.data.config.observeOnly, observeOnly); assert.equal(reopened.data.config.enabled, false);
  }
});
