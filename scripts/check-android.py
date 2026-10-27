import json
import pathlib
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

PACKAGE = 'com.novela.capybaraknight'
OUT = pathlib.Path('artifacts/android-device')
OUT.mkdir(parents=True, exist_ok=True)


def adb(*args):
    return subprocess.check_output(['adb', *args], timeout=30)


def tree():
    adb('shell', 'uiautomator', 'dump', '/sdcard/window.xml')
    return ET.fromstring(adb('exec-out', 'cat', '/sdcard/window.xml'))


def wait_node(label, timeout=45):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        root = tree()
        for node in root.iter('node'):
            if label in (re.sub(r'\s+', ' ', node.get('content-desc', '')).strip(), re.sub(r'\s+', ' ', node.get('text', '')).strip()):
                return node
        time.sleep(0.5)
    (OUT / 'failure.xml').write_bytes(adb('exec-out', 'cat', '/sdcard/window.xml'))
    (OUT / 'failure.png').write_bytes(adb('exec-out', 'screencap', '-p'))
    raise AssertionError(f'Control or text did not appear: {label}')


def tap(label):
    node = wait_node(label)
    assert node.get('enabled') == 'true', label
    left, top, right, bottom = map(int, re.findall(r'\d+', node.get('bounds')))
    adb('shell', 'input', 'tap', str((left + right) // 2), str((top + bottom) // 2))


def launch():
    adb('shell', 'am', 'start', '-W', '-n', PACKAGE + '/.MainActivity')


def next_to(label, timeout=90):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        root = tree()
        for node in root.iter('node'):
            if label in (node.get('content-desc', ''), node.get('text', '')):
                return
        for action in ['Продолжить чтение', 'Следующая реплика или сцена', 'Показать реплику целиком']:
            node = next((item for item in root.iter('node') if item.get('content-desc') == action and item.get('enabled') == 'true'), None)
            if node is not None:
                left, top, right, bottom = map(int, re.findall(r'\d+', node.get('bounds')))
                adb('shell', 'input', 'tap', str((left + right) // 2), str((top + bottom) // 2))
                break
        time.sleep(0.3)
    (OUT / 'failure.png').write_bytes(adb('exec-out', 'screencap', '-p'))
    raise AssertionError(f'Story did not reach: {label}')


def tap_scroll(label):
    for _ in range(6):
        root = tree()
        for node in root.iter('node'):
            if label in (node.get('content-desc', ''), node.get('text', '')):
                left, top, right, bottom = map(int, re.findall(r'\d+', node.get('bounds')))
                if right > left and bottom > top:
                    adb('shell', 'input', 'tap', str((left + right) // 2), str((top + bottom) // 2))
                    return
        bounds = re.findall(r'\d+', next(root.iter('node')).get('bounds'))
        left, top, right, bottom = map(int, bounds)
        adb('shell', 'input', 'swipe', str((left + right) // 2), str(top + (bottom - top) * 4 // 5), str((left + right) // 2), str(top + (bottom - top) // 4), '450')
    raise AssertionError(f'Scrolling did not reveal: {label}')


adb('install', '-r', sys.argv[1])
adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0')
adb('shell', 'settings', 'put', 'system', 'user_rotation', '1')
launch()
tap('Добавить игрока')
tap('Имя игрока')
adb('shell', 'input', 'text', 'MobileTest')
adb('shell', 'input', 'keyevent', '4')
tap('Создать профиль')
tap('Начать историю →')
wait_node('Нажми справа, чтобы продолжить →')
tap('Следующая реплика или сцена')
FIRST_LINE = 'Ни одного знакомого поворота. Я впервые забрался так далеко, а лес всё тянется и тянется — будто дорога решила проверить моё терпение.'
wait_node(FIRST_LINE)
assert any('mobiletest' in (node.get('text', '') + node.get('content-desc', '')).lower() and 'мысли' in (node.get('text', '') + node.get('content-desc', '')).lower() for node in tree().iter('node'))
adb('shell', 'am', 'force-stop', PACKAGE)
launch()
tap('Играть: MobileTest')
tap('Продолжить историю →')
wait_node(FIRST_LINE)
(OUT / 'landscape.png').write_bytes(adb('exec-out', 'screencap', '-p'))
adb('shell', 'settings', 'put', 'system', 'user_rotation', '0')
wait_node('Поверни телефон горизонтально')
labels = [node.get('content-desc', '') for node in tree().iter('node')]
assert 'Открыть меню' not in labels and 'Продолжить чтение' not in labels
(OUT / 'portrait.png').write_bytes(adb('exec-out', 'screencap', '-p'))
adb('shell', 'settings', 'put', 'system', 'user_rotation', '1')
wait_node(FIRST_LINE)
next_to('Увеличить доску: Доска у «Ночной Колючки»')
if any(node.get('content-desc') == 'Прочитать: Капибара-паук' for node in tree().iter('node')):
    tap('Прочитать: Капибара-паук')
else:
    tap('Увеличить доску: Доска у «Ночной Колючки»')
    tap_scroll('Прочитать: Капибара-паук')
story = json.loads(pathlib.Path('public/story.json').read_text(encoding='utf-8'))
notices = next(scene['board'] for scene in story['scenes'] if scene.get('board', {}).get('kind') == 'notices')
wait_node(notices['items'][0]['text'])
(OUT / 'notice.png').write_bytes(adb('exec-out', 'screencap', '-p'))
tap('Закрыть доску')
next_to('Увеличить доску: Наши напитки')
tap('Увеличить доску: Наши напитки')
tap_scroll('Заказать: Какао с зефиром')
serving = next(scene for scene in story['scenes'] if scene['id'] == 'scen4-2')
cocoa = next(line['text'] for line in serving['dialogues'] if line.get('condition', {}).get('drink') == 'Какао с зефиром')
next_to(cocoa)
(OUT / 'drink-response.png').write_bytes(adb('exec-out', 'screencap', '-p'))
tap('Открыть меню')
tap_scroll('Пройденные главы')
tap_scroll('Переиграть: Добро пожаловать в «Ночную Колючку»')
tap_scroll('Переиграть главу')
wait_node('Увеличить доску: Доска у «Ночной Колючки»')
next_to('Увеличить доску: Наши напитки')
tap('Увеличить доску: Наши напитки')
(OUT / 'drinks.png').write_bytes(adb('exec-out', 'screencap', '-p'))
tap_scroll('Заказать: Ягодный морс')
berries = next(line['text'] for line in serving['dialogues'] if line.get('condition', {}).get('drink') == 'Ягодный морс')
next_to(berries)
(OUT / 'replayed-chapter.png').write_bytes(adb('exec-out', 'screencap', '-p'))
print('APK: launch, profile name, restored dialogue, portrait guard, notices, drink responses and chapter replay passed.')
