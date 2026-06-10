#!/usr/bin/env node

import { loadEnvFile } from './env-file.js';
import { assertRuntimeCompatibility } from './runtime-check.js';

loadEnvFile('.env');

await assertRuntimeCompatibility();

await import('../server.js');
