#!/usr/bin/env node

import { loadEnvFile } from './env-file.js';

loadEnvFile('.env');

await import('../server.js');
