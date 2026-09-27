// lib/image-url.mjs 的单元测试
// 运行：node --test test/*.mjs（也可直接 node --test 自动发现）
// 注意：Node ≥22 起 `node --test test/` 会把目录当单个测试项，报 MODULE_NOT_FOUND，别用带目录的写法。
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeImageUrl,
  extractImageEntries,
  imageExtFromUrl,
  isLikelyImageUrl,
} from '../lib/image-url.mjs';

describe('sanitizeImageUrl：尾部标点（防吞标点的核心场景）', () => {
  const cases = [
    // 用户反馈的两个原始 bug
    ['![标题](https://e.com/a.png）', 'https://e.com/a.png'],
    ['![](https://e.com/b.jpg"', 'https://e.com/b.jpg'],
    // 各种右括号 / 右引号
    ['https://e.com/c.png)', 'https://e.com/c.png'],
    ['https://e.com/c.png）', 'https://e.com/c.png'],
    ['https://e.com/c.png]', 'https://e.com/c.png'],
    ['https://e.com/c.png】', 'https://e.com/c.png'],
    ['https://e.com/c.png>', 'https://e.com/c.png'],
    ['https://e.com/c.png”', 'https://e.com/c.png'],
    ['https://e.com/c.png’', 'https://e.com/c.png'],
    ['https://e.com/c.png"', 'https://e.com/c.png'],
    ["https://e.com/c.png'", 'https://e.com/c.png'],
    // 多余右括号：只有「多出来的」才剥
    ['https://e.com/c.png))', 'https://e.com/c.png'],
    // 中文 / 半角标点
    ['https://e.com/c.png,', 'https://e.com/c.png'],
    ['https://e.com/c.png，', 'https://e.com/c.png'],
    ['https://e.com/c.png、', 'https://e.com/c.png'],
    ['https://e.com/c.png;', 'https://e.com/c.png'],
    ['https://e.com/c.png；', 'https://e.com/c.png'],
    ['https://e.com/c.png:', 'https://e.com/c.png'],
    ['https://e.com/c.png：', 'https://e.com/c.png'],
    ['https://e.com/c.png.', 'https://e.com/c.png'],
    ['https://e.com/c.png。', 'https://e.com/c.png'],
    ['https://e.com/c.png!', 'https://e.com/c.png'],
    ['https://e.com/c.png！', 'https://e.com/c.png'],
    ['https://e.com/c.png?', 'https://e.com/c.png'],
    ['https://e.com/c.png？', 'https://e.com/c.png'],
    ['https://e.com/c.png*', 'https://e.com/c.png'],
    // 多种标点叠加
    ['![t](https://e.com/c.png）。', 'https://e.com/c.png'],
    ['https://e.com/c.png,）"', 'https://e.com/c.png'],
    // 首尾空白
    ['  https://e.com/c.png\t ', 'https://e.com/c.png'],
  ];

  for (const [input, expected] of cases) {
    test(`剥掉尾部标点：${JSON.stringify(input)}`, () => {
      assert.equal(sanitizeImageUrl(input), expected);
    });
  }
});

describe('sanitizeImageUrl：包裹与 Markdown 片段', () => {
  const cases = [
    ['<https://e.com/e.png>', 'https://e.com/e.png'],
    ['（https://e.com/h.png）', 'https://e.com/h.png'],
    ['【https://e.com/i.png】', 'https://e.com/i.png'],
    ['[https://e.com/j.png]', 'https://e.com/j.png'],
    ['“https://e.com/k.png”', 'https://e.com/k.png'],
    ['‘https://e.com/k.png’', 'https://e.com/k.png'],
    ['"https://e.com/k.png"', 'https://e.com/k.png'],
    ["'https://e.com/k.png'", 'https://e.com/k.png'],
    // 整段 Markdown：带标题、带尖括号 URL
    ['![t](https://e.com/d.png "说明")', 'https://e.com/d.png'],
    ["![t](https://e.com/d.png '说明')", 'https://e.com/d.png'],
    ['![t](<https://e.com/o.png>)', 'https://e.com/o.png'],
    ['[文字](https://e.com/s.png)', 'https://e.com/s.png'],
    // 整段纯文字里的裸链
    ['请见 https://e.com/g.png 谢谢', 'https://e.com/g.png'],
    ['图片地址：（https://e.com/q.png）', 'https://e.com/q.png'],
    ['链接 https://e.com/r.png。', 'https://e.com/r.png'],
    ['见 <https://e.com/t.png>。', 'https://e.com/t.png'],
    // 中文字符紧贴 URL（无空格）时，中文标点必须截断
    ['见 https://e.com/u.png，谢谢', 'https://e.com/u.png'],
    ['https://e.com/v.png，谢谢', 'https://e.com/v.png'],
    ['地址：https://e.com/w.png。请联系我', 'https://e.com/w.png'],
    ['https://e.com/x.png！', 'https://e.com/x.png'],
  ];

  for (const [input, expected] of cases) {
    test(`去包裹 / 取片段：${JSON.stringify(input)}`, () => {
      assert.equal(sanitizeImageUrl(input), expected);
    });
  }
});

describe('sanitizeImageUrl：保留合法字符', () => {
  test('配对的圆括号保留（维基百科式路径）', () => {
    assert.equal(
      sanitizeImageUrl('https://en.wikipedia.org/wiki/Foo_(bar)'),
      'https://en.wikipedia.org/wiki/Foo_(bar)'
    );
    assert.equal(sanitizeImageUrl('https://e.com/f_(g).png'), 'https://e.com/f_(g).png');
    assert.equal(sanitizeImageUrl('https://e.com/f_(g).png?v=1#top'), 'https://e.com/f_(g).png?v=1#top');
  });

  test('保留 query 与 fragment', () => {
    assert.equal(sanitizeImageUrl('https://e.com/a.png?x=1#y'), 'https://e.com/a.png?x=1#y');
    assert.equal(sanitizeImageUrl('https://e.com/a.png?x=1#'), 'https://e.com/a.png?x=1');
    assert.equal(sanitizeImageUrl('https://e.com/a.png?#'), 'https://e.com/a.png');
  });

  test('URL 中的合法标点不被破坏', () => {
    assert.equal(
      sanitizeImageUrl('https://e.com/a_b-c~d%20e.png'),
      'https://e.com/a_b-c~d%20e.png'
    );
  });

  test('中文文件名（URL 中的中文字符）保留', () => {
    assert.equal(sanitizeImageUrl('https://e.com/图片.png'), 'https://e.com/图片.png');
    assert.equal(imageExtFromUrl('https://e.com/图片.png'), '.png');
  });

  test('保留原样大小写（含大写 scheme）', () => {
    assert.equal(sanitizeImageUrl('HTTPS://E.COM/A.PNG'), 'HTTPS://E.COM/A.PNG');
  });
});

describe('sanitizeImageUrl：非法输入返回 null', () => {
  const invalid = [
    ['ftp://e.com/a.png', '非 http(s) 协议'],
    ['//e.com/a.png', '协议相对链接'],
    ['https://', '没有主机名'],
    ['e.com/a.png', '没有协议'],
    ['', '空串'],
    ['   ', '纯空白'],
    ['没有任何链接的文字', '纯文字'],
    [null, 'null'],
    [undefined, 'undefined'],
    [123, '数字'],
    [{ url: 'https://e.com/a.png' }, '对象'],
  ];

  for (const [input, label] of invalid) {
    test(`${label} → null`, () => {
      assert.equal(sanitizeImageUrl(input), null);
    });
  }
});

describe('extractImageEntries：语法形态', () => {
  test('Markdown 图片：alt 作为 title', () => {
    assert.deepEqual(extractImageEntries('![甲](https://e.com/a.png)'), [
      { url: 'https://e.com/a.png', title: '甲' },
    ]);
  });

  test('alt 为空 / 纯空白：不产生 title 字段', () => {
    assert.deepEqual(extractImageEntries('![](https://e.com/a.png)'), [
      { url: 'https://e.com/a.png' },
    ]);
    assert.deepEqual(extractImageEntries('![   ](https://e.com/a.png)'), [
      { url: 'https://e.com/a.png' },
    ]);
  });

  test('Markdown 链接：文字作为 title；自动链接 / 裸链接只取 URL', () => {
    assert.deepEqual(extractImageEntries('[说明](https://e.com/a.png)'), [
      { url: 'https://e.com/a.png', title: '说明' },
    ]);
    assert.deepEqual(extractImageEntries('<https://e.com/b.png>'), [
      { url: 'https://e.com/b.png' },
    ]);
    assert.deepEqual(extractImageEntries('参见 https://e.com/c.png'), [
      { url: 'https://e.com/c.png' },
    ]);
  });

  test('Markdown 链接 title 的防噪音守卫', () => {
    // 文字本身就是同一个 URL → 不当标题
    assert.deepEqual(
      extractImageEntries('[https://e.com/a.png](https://e.com/a.png)'),
      [{ url: 'https://e.com/a.png' }]
    );
    // 前后带空格的 URL 文字 → trim 后仍等于 URL，不当标题
    assert.deepEqual(
      extractImageEntries('[  https://e.com/a.png  ](https://e.com/a.png)'),
      [{ url: 'https://e.com/a.png' }]
    );
    // 文字以 http(s) 开头（不同 URL）→ 不当标题
    assert.deepEqual(
      extractImageEntries('[HTTPS://other.com/x.png](https://e.com/a.png)'),
      [{ url: 'https://e.com/a.png' }]
    );
    // 空文字 / 纯空白 → 无 title 字段
    assert.deepEqual(extractImageEntries('[](https://e.com/a.png)'), [
      { url: 'https://e.com/a.png' },
    ]);
    assert.deepEqual(extractImageEntries('[   ](https://e.com/a.png)'), [
      { url: 'https://e.com/a.png' },
    ]);
    // 正常中文文字 → 保留为标题（手写 `[晨光](https://...)` 场景）
    assert.deepEqual(extractImageEntries('[晨光](https://e.com/a.png)'), [
      { url: 'https://e.com/a.png', title: '晨光' },
    ]);
    assert.deepEqual(extractImageEntries('[  晨光  ](https://e.com/a.png)'), [
      { url: 'https://e.com/a.png', title: '晨光' },
    ]);
  });

  test('title 做 trim', () => {
    assert.deepEqual(extractImageEntries('![  标题  ](https://e.com/a.png)'), [
      { url: 'https://e.com/a.png', title: '标题' },
    ]);
  });

  test('一行多张 + 跨行 + 保持出现顺序', () => {
    assert.deepEqual(
      extractImageEntries('![甲](https://e.com/a.png) 和 ![乙](https://e.com/b.png)'),
      [
        { url: 'https://e.com/a.png', title: '甲' },
        { url: 'https://e.com/b.png', title: '乙' },
      ]
    );

    const text = [
      '![甲](https://e.com/a.png)',
      '这是说明文字',
      '- ![](https://e.com/b.png)',
      '- <https://e.com/c.png>',
      '- https://e.com/d.png',
    ].join('\n');
    assert.deepEqual(extractImageEntries(text), [
      { url: 'https://e.com/a.png', title: '甲' },
      { url: 'https://e.com/b.png' },
      { url: 'https://e.com/c.png' },
      { url: 'https://e.com/d.png' },
    ]);
  });

  test('同 URL 去重，保留首次出现与首次 title', () => {
    assert.deepEqual(
      extractImageEntries(
        '![甲](https://e.com/a.png) https://e.com/a.png ![乙](https://e.com/a.png) ![丙](https://e.com/b.png)'
      ),
      [
        { url: 'https://e.com/a.png', title: '甲' },
        { url: 'https://e.com/b.png', title: '丙' },
      ]
    );
  });

  test('修复全角右括号 / 尾部引号（原始 bug 场景）', () => {
    assert.deepEqual(extractImageEntries('![标题](https://e.com/a.png）'), [
      { url: 'https://e.com/a.png', title: '标题' },
    ]);
    assert.deepEqual(extractImageEntries('![](https://e.com/b.jpg"'), [
      { url: 'https://e.com/b.jpg' },
    ]);
    assert.deepEqual(extractImageEntries('![t](https://e.com/c.webp)。'), [
      { url: 'https://e.com/c.webp', title: 't' },
    ]);
  });

  test('Markdown 标题语法不进入 URL', () => {
    assert.deepEqual(extractImageEntries('![t](https://e.com/d.png "说明")'), [
      { url: 'https://e.com/d.png', title: 't' },
    ]);
    assert.deepEqual(extractImageEntries('[文字](https://e.com/e.png "标题")'), [
      { url: 'https://e.com/e.png', title: '文字' },
    ]);
  });

  test('保留 query / fragment 与配对括号', () => {
    assert.deepEqual(
      extractImageEntries('![维基](https://en.wikipedia.org/wiki/Foo_(bar).png?v=1#sec)'),
      [{ url: 'https://en.wikipedia.org/wiki/Foo_(bar).png?v=1#sec', title: '维基' }]
    );
  });

  test('裸链后紧跟中文标点也能截断', () => {
    assert.deepEqual(extractImageEntries('见 https://e.com/a.png，谢谢'), [
      { url: 'https://e.com/a.png' },
    ]);
    assert.deepEqual(extractImageEntries('![t](https://e.com/b.png，说明）'), [
      { url: 'https://e.com/b.png', title: 't' },
    ]);
  });

  test('非 http(s) 链接被忽略', () => {
    assert.deepEqual(extractImageEntries('ftp://e.com/a.png mailto:x@y.com'), []);
  });

  test('空输入 / 非字符串返回空数组', () => {
    assert.deepEqual(extractImageEntries(''), []);
    assert.deepEqual(extractImageEntries(null), []);
    assert.deepEqual(extractImageEntries(undefined), []);
    assert.deepEqual(extractImageEntries(42), []);
  });

  test('同 URL 不同尾标点只算一条', () => {
    assert.deepEqual(
      extractImageEntries('![a](https://e.com/a.png) https://e.com/a.png）'),
      [{ url: 'https://e.com/a.png', title: 'a' }]
    );
  });
});

describe('imageExtFromUrl', () => {
  const cases = [
    ['https://e.com/a.png', '.png'],
    ['https://e.com/a.PNG', '.png'],
    ['https://e.com/a.jpeg', '.jpeg'],
    ['https://e.com/a.jpg?x=1', '.jpg'],
    ['https://e.com/a.webp#frag', '.webp'],
    ['https://e.com/a.avif', '.avif'],
    ['https://e.com/a.svg', '.svg'],
    ['https://e.com/a.png）', '.png'],
    ['https://e.com/page', null],
    ['https://e.com/a.txt', null],
    ['https://e.com/a.png/', null],
    ['not a url', null],
    ['https://', null],
    [null, null],
  ];

  for (const [input, expected] of cases) {
    test(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
      assert.equal(imageExtFromUrl(input), expected);
    });
  }
});

describe('isLikelyImageUrl', () => {
  const cases = [
    ['https://e.com/a.png', true],
    ['https://e.com/a.jpeg?x=1', true],
    ['https://e.com/a.png）', true],
    ['https://github.com/user-attachments/assets/abc-123', true],
    ['https://user-images.githubusercontent.com/1/2.png', true],
    ['https://i.imgur.com/abc123', true],
    ['https://e.com/about', false],
    ['https://e.com/a.txt', false],
    ['ftp://e.com/a.png', false],
    ['', false],
    [null, false],
  ];

  for (const [input, expected] of cases) {
    test(`${JSON.stringify(input)} → ${expected}`, () => {
      assert.equal(isLikelyImageUrl(input), expected);
    });
  }
});
