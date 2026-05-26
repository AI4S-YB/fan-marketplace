'use strict';
const https = require('node:https');
const http = require('node:http');
const fs = require('node:fs');

function fetchIndex(registryUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL(registryUrl.endsWith('/index.json') ? registryUrl : registryUrl + '/index.json');
    // For file:// or local paths, read directly
    if (url.protocol === 'file:') {
      const content = fs.readFileSync(url.pathname, 'utf-8');
      resolve(JSON.parse(content));
      return;
    }
    const mod = url.protocol === 'https:' ? https : http;
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      headers: { 'Accept': 'application/json', 'User-Agent': 'fan-cli/0.1.0' }
    };
    mod.get(options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchIndex(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch registry index: HTTP ${res.statusCode} from ${registryUrl}`));
        return;
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Failed to parse registry index JSON: ${e.message}`));
        }
      });
    }).on('error', (e) => {
      reject(new Error(`Failed to connect to registry at ${registryUrl}: ${e.message}`));
    });
  });
}

function searchSkills(index, query) {
  if (!query || query.trim() === '') {
    return index.skills;
  }
  const q = query.toLowerCase().trim();
  return index.skills.filter(s => {
    return s.id.toLowerCase().includes(q) ||
      (s.display_name && s.display_name.toLowerCase().includes(q)) ||
      (s.description && s.description.toLowerCase().includes(q)) ||
      (s.keywords && s.keywords.some(k => k.toLowerCase().includes(q)));
  });
}

function resolveDependencies(index, requiredCapabilities) {
  const resolved = [];
  for (const capId of requiredCapabilities) {
    const provider = index.skills.find(s =>
      s.provides && s.provides.includes(capId)
    );
    if (provider) {
      resolved.push({ skillId: provider.id, capabilityId: capId });
    }
  }
  return resolved;
}

function getSkillInfo(index, skillId) {
  return index.skills.find(s => s.id === skillId) || null;
}

module.exports = { fetchIndex, searchSkills, resolveDependencies, getSkillInfo };
