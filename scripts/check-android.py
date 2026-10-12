"""Smoke-test our installed preview APK on the disposable CI emulator."""
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
print('APK: launch, profile, restored dialogue and portrait guard passed.')
