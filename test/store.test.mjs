import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { projectRoot } from '../src/paths.mjs';

test('new installations default to automatic mode with no chats; saved observe mode remains unchanged on reopen', async () => {
  const parent = path.join(projectRoot, '.runtime', 'tests'); await fs.mkdir(parent, { recursive: true });
  const home = await fs.mkdtemp(path.join(parent, 'defaults-'));
  const store = await new Store(home).open();
  assert.equal(store.data.config.observeOnly, false); assert.deepEqual(store.data.watches, {});
  store.data.config.observeOnly = true; store.data.config.enabled = false; await store.save();
  const reopened = await new Store(home).open();
  assert.equal(reopened.data.config.observeOnly, true); assert.equal(reopened.data.config.enabled, false);
});
