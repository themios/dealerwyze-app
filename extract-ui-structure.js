#!/usr/bin/env node

/**
 * UI Structure Extractor
 *
 * Analyzes React component files to extract:
 * - Page titles and URLs
 * - Button labels and icons
 * - Routes and navigation links
 * - Dialog/modal names
 * - Sub-menu structures
 *
 * Usage: node extract-ui-structure.js > ui-structure-extracted.md
 */

const fs = require('fs');
const path = require('path');

const COMPONENTS_DIR = './components';
const PAGES_DIR = './app/(app)';

// Track findings
const pages = {};
const buttons = [];
const routes = new Set();

// Helper to find files
function findFiles(dir, pattern) {
  const files = [];

  function walk(current) {
    if (!fs.existsSync(current)) return;

    fs.readdirSync(current).forEach(file => {
      const filePath = path.join(current, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory() && !file.startsWith('.')) {
        walk(filePath);
      } else if (stat.isFile() && pattern.test(file)) {
        files.push(filePath);
      }
    });
  }

  walk(dir);
  return files;
}

// Extract page info from page.tsx files
function extractPageInfo() {
  console.log('// Extracting page information...\n');

  const pageFiles = findFiles(PAGES_DIR, /page\.tsx$/);

  pageFiles.forEach(filePath => {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(PAGES_DIR, filePath);
    const pageRoute = '/' + relativePath.replace(/\/page\.tsx$/, '').replace(/^\(app\)/, '');

    // Find TopBar title
    const topBarMatch = content.match(/title\s*=\s*{?["\']([^"']+)["']/);
    const titleMatch = content.match(/title:\s*["\']([^"']+)["']/);

    if (topBarMatch || titleMatch) {
      const title = topBarMatch?.[1] || titleMatch?.[1] || 'Unknown';
      console.log(`// PAGE: ${pageRoute}`);
      console.log(`// Title: ${title}\n`);
    }

    routes.add(pageRoute);
  });
}

// Extract button info from component files
function extractButtonInfo() {
  console.log('\n// Extracting button information...\n');

  const componentFiles = findFiles(COMPONENTS_DIR, /\.(tsx|ts)$/);

  componentFiles.forEach(filePath => {
    const content = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);

    // Find Button components with titles or labels
    const buttonMatches = content.matchAll(/<Button[^>]*(?:title|label|className)[^>]*>([^<]*)<\/Button>/g);
    const buttonTextMatches = content.matchAll(/<Button[^>]*>\s*(?:<[^>]*>)*\s*([A-Z][^<]*)/g);

    for (const match of buttonMatches) {
      const text = match[1].trim();
      if (text.length > 0 && text.length < 50) {
        buttons.push({
          file: fileName,
          label: text,
          context: filePath
        });
      }
    }
  });

  // Remove duplicates and sort
  const uniqueButtons = [...new Set(buttons.map(b => b.label))].sort();
  uniqueButtons.forEach(label => {
    console.log(`// Button: "${label}"`);
  });
}

// Extract navigation structure from DesktopSidebar
function extractNavigationStructure() {
  console.log('\n// Extracting navigation structure...\n');

  const sidebarPath = './components/layout/DesktopSidebar.tsx';
  if (fs.existsSync(sidebarPath)) {
    const content = fs.readFileSync(sidebarPath, 'utf8');

    // Extract BASE_NAV
    const baseNavMatch = content.match(/const BASE_NAV = \[([\s\S]*?)\]/);
    if (baseNavMatch) {
      console.log('// BASE_NAV (all users):');
      const navItems = baseNavMatch[1].match(/{\s*href:\s*['\"]([^'\"]+)['\"],\s*label:\s*['\"]([^'\"]+)['\"]/g);
      if (navItems) {
        navItems.forEach(item => {
          const match = item.match(/href:\s*['\"]([^'\"]+)['\"],\s*label:\s*['\"]([^'\"]+)['"]/);
          if (match) {
            console.log(`//   - ${match[2]} → ${match[1]}`);
            routes.add(match[1]);
          }
        });
      }
    }

    // Extract ROLE_NAV
    const roleNavMatch = content.match(/const ROLE_NAV:[\s\S]*?\n\]/);
    if (roleNavMatch) {
      console.log('\n// ROLE_NAV (role-based):');
      const navItems = roleNavMatch[0].match(/{\s*href:\s*['\"]([^'\"]+)['\"],\s*label:\s*['\"]([^'\"]+)['\"]/g);
      if (navItems) {
        navItems.forEach(item => {
          const match = item.match(/href:\s*['\"]([^'\"]+)['\"],\s*label:\s*['\"]([^'\"]+)['"]/);
          if (match) {
            console.log(`//   - ${match[2]} → ${match[1]}`);
            routes.add(match[1]);
          }
        });
      }
    }
  }
}

// Extract routes
function extractRoutes() {
  console.log('\n// All discovered routes:');
  [...routes].sort().forEach(route => {
    console.log(`//   ${route}`);
  });
}

// Main
console.log('/**\n * UI STRUCTURE EXTRACTION RESULTS\n * Generated: ' + new Date().toISOString() + '\n */\n');

extractPageInfo();
extractNavigationStructure();
extractButtonInfo();
extractRoutes();

console.log('\n// END EXTRACTION\n');
console.log('// Note: Review extracted data and manually verify against actual UI\n');
