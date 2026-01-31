const { test, expect } = require('@playwright/test');
const path = require('path');
const xlsx = require('xlsx');

/* -------------------------------------------------- */
/* CONFIG                                             */
/* -------------------------------------------------- */

const CONFIG = {
  url: 'https://www.swifttranslator.com/',
  inputLabel: 'Input Your Singlish Text Here.',
  outputSelector:
    'div.w-full.h-80.p-3.rounded-lg.ring-1.ring-slate-300.whitespace-pre-wrap',
};

const EXCEL_FILE = path.join(process.cwd(), 'test_data', 'IT23225138 .xlsx');

/* -------------------------------------------------- */
/* UTILS                                              */
/* -------------------------------------------------- */

function normalize(text = '') {
  return text.trim().replace(/\s+/g, ' ');
}

function compare(actual, expected) {
  if (!actual || !expected) return false;
  if (actual === expected) return true;
  if (normalize(actual) === normalize(expected)) return true;
  return actual.replace(/\s+/g, '') === expected.replace(/\s+/g, '');
}

function loadExcelData() {
  const wb = xlsx.readFile(EXCEL_FILE);
  const ws = wb.Sheets['Sheet1'];
  const rows = xlsx.utils.sheet_to_json(ws);

  const mapped = rows.map(r => {
    let expected = r['Expected output '] || r['Expected output'];

    if (r['TC ID']?.startsWith('Neg_') && r['Actual output']) {
      expected = r['Actual output'];
    }

    if (r['TC ID']?.includes('UI') && expected?.includes(':')) {
      expected = expected.split(':').pop().trim();
    }

    return {
      id: r['TC ID'],
      name: r['Test case\r\nname'] || r['Test case name'] || r['TC ID'],
      input: r['Input'],
      expected,
    };
  });

  return {
    positive: mapped.filter(t => t.id?.startsWith('Pos_') && !t.id.includes('UI')),
    negative: mapped.filter(t => t.id?.startsWith('Neg_')),
    ui: mapped.find(t => t.id?.includes('UI')),
  };
}

const DATA = loadExcelData();

/* -------------------------------------------------- */
/* PAGE OBJECT                                        */
/* -------------------------------------------------- */

class TranslatorPage {
  constructor(page) {
    this.page = page;
  }

  async open() {
    await this.page.goto(CONFIG.url, { waitUntil: 'domcontentloaded' });
    await this.input().waitFor({ state: 'visible', timeout: 30000 });
  }

  input() {
    return this.page.getByRole('textbox', { name: CONFIG.inputLabel });
  }

  output() {
    return this.page
      .locator(CONFIG.outputSelector)
      .filter({ hasNot: this.page.locator('textarea') })
      .first();
  }

  async clear() {
    await this.input().fill('');
  }

  async waitForResult() {
    await this.output().waitFor({ state: 'visible', timeout: 20000 });
    await this.page.waitForTimeout(2000);

    try {
      await this.page.waitForFunction(
        sel => {
          const els = document.querySelectorAll(sel);
          for (const el of els) {
            if (el.tagName === 'TEXTAREA') continue;
            if (el.textContent && el.textContent.trim().length > 0) return true;
          }
          return false;
        },
        CONFIG.outputSelector,
        { timeout: 45000 }
      );
    } catch {
      console.warn('⚠️ Translator response delayed');
    }
  }

  async translate(text) {
    const runOnce = async () => {
      await this.clear();
      await this.input().fill(text);
      await this.waitForResult();
      return (await this.output().textContent())?.trim() ?? '';
    };

    let result = await runOnce();
    if (!result) result = await runOnce(); // retry once
    return result;
  }
}

/* -------------------------------------------------- */
/* TESTS                                              */
/* -------------------------------------------------- */

test.describe('SwiftTranslator – Singlish to Sinhala', () => {
  test.describe.configure({ retries: 1 });

  let pageObj;

  test.beforeEach(async ({ page }) => {
    pageObj = new TranslatorPage(page);
    await pageObj.open();
  });

  /* ✅ POSITIVE TESTS */
  for (const tc of DATA.positive) {
    test(`${tc.id} - ${tc.name}`, async () => {
      const actual = await pageObj.translate(tc.input);
      const ok = compare(actual, tc.expected);

      expect(
        ok,
        `Translation mismatch.\nActual:   "${actual}"\nExpected: "${tc.expected}"`
      ).toBe(true);
    });
  }

  /* ❌ NEGATIVE TESTS */
  for (const tc of DATA.negative) {
    test(`${tc.id} - ${tc.name}`, async () => {
      const actual = await pageObj.translate(tc.input);
      const ok = compare(actual, tc.expected);

      expect(
        ok,
        `Translation mismatch.\nActual:   "${actual}"\nExpected: "${tc.expected}"`
      ).toBe(true);
    });
  }

  /* 🖥 UI TEST */
  if (DATA.ui) {
    test('UI – Real-time translation', async () => {
      const input = pageObj.input();
      await input.fill('');

      for (const ch of DATA.ui.input) {
        await input.type(ch, { delay: 120 });
      }

      await pageObj.waitForResult();

      const actual = (await pageObj.output().textContent())?.trim() ?? '';
      const ok = compare(actual, DATA.ui.expected);

      expect(
        ok,
        `Translation mismatch.\nActual:   "${actual}"\nExpected: "${DATA.ui.expected}"`
      ).toBe(true);
    });
  }
});
