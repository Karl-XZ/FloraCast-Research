import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

out = Path(__file__).resolve().parents[2] / 'test-results'
out.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://localhost:5179/research.html')
    page.wait_for_load_state('networkidle')
    expect(page.locator('#connection')).to_have_text('科研服务已连接')
    page.screenshot(path=str(out / 'research-home.png'), full_page=True)
    page.get_by_role('button', name='创建研究', exact=True).click()
    page.locator('[name=mode]').select_option('demo')
    page.get_by_role('button', name='冻结协议并运行').click()
    expect(page.locator('#run-status')).to_have_text('已完成', timeout=60000)
    hidden_notes = [
        '无有效数据不生成结论',
        '质量状态未知时不声称通过 QA',
        '方法不一致时保留差异',
        '无独立观测时不声称外部验证',
        '不允许因果措辞',
    ]
    for view in ['map', 'data', 'experiments', 'evidence', 'report', 'runs']:
        page.locator(f'[data-view={view}]').click()
        expect(page.locator('#detail-content')).not_to_be_empty()
        for note in hidden_notes:
            expect(page.locator('body')).not_to_contain_text(note)
    page.locator('[data-view=map]').click()
    expect(page.locator('#research-map')).to_be_visible()
    page.locator('[data-view=experiments]').click()
    page.locator('#ground-csv').fill('date,species,source\n2024-03-22,Quercus robur,browser fixture')
    page.locator('#validate-ground').click()
    expect(page.locator('.validation-card')).to_contain_text('no-comparable-estimates')
    page.locator('#compare-run').click()
    expect(page.locator('#detail-content')).to_contain_text('跨运行比较')
    page.locator('[data-view=evidence]').click()
    expect(page.locator('.claim')).to_have_count(5)
    page.locator('.claim summary').first.click()
    expect(page.locator('body')).not_to_contain_text('不允许因果措辞')
    page.screenshot(path=str(out / 'research-evidence.png'), full_page=True)
    page.locator('#research-notes-link').click()
    expect(page.locator('h1')).to_have_text('研究说明')
    for note in hidden_notes:
        expect(page.locator('#run-notes')).to_contain_text(note)
    page.locator('#notes-back').click()
    expect(page.locator('#run-id')).to_be_visible()
    previous_run = page.locator('#run-id').inner_text()
    page.get_by_role('button', name='冻结快照复算', exact=True).click()
    expect(page.locator('#run-id')).not_to_have_text(previous_run)
    expect(page.locator('#run-status')).to_have_text('已完成', timeout=60000)
    page.locator('[data-view=report]').click()
    expect(page.locator('#detail-content')).to_contain_text('输入一致，输出一致')
    with page.expect_download() as download_info:
        page.locator('#export-run').click()
    download = download_info.value
    download.save_as(out / 'browser-export.json')
    exported = json.loads((out / 'browser-export.json').read_text(encoding='utf-8'))
    assert exported['reproductionComparison']['outputsEqual'] is True
    with page.expect_download() as notebook_info:
        page.locator('#export-notebook').click()
    notebook_info.value.save_as(out / 'browser-notebook.ipynb')
    notebook = json.loads((out / 'browser-notebook.ipynb').read_text(encoding='utf-8'))
    for cell in notebook['cells']:
        if cell['cell_type'] == 'code':
            exec(''.join(cell['source']), {})
    page.set_viewport_size({'width': 390, 'height': 844})
    page.locator('[data-view=projects]').click()
    page.screenshot(path=str(out / 'research-mobile.png'), full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not errors, errors
    print(json.dumps({'browserErrors': errors, 'exportedRun': exported['id'], 'views': 7, 'groundValidation': 'submitted', 'comparison': 'rendered', 'reproduction': 'matched'}))
    browser.close()
