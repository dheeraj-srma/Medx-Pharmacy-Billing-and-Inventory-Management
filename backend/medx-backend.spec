# -*- mode: python ; coding: utf-8 -*-
import os
import sys

block_cipher = None

backend_dir = os.path.abspath(SPECPATH)

hidden_imports = [
    'uvicorn',
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.loops.asyncio',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.http.h11_impl',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'uvicorn.lifespan.off',
    'sqlalchemy',
    'sqlalchemy.dialects.postgresql',
    'sqlalchemy.dialects.postgresql.psycopg2',
    'sqlalchemy.dialects.sqlite',
    'psycopg2',
    'passlib',
    'passlib.handlers',
    'passlib.handlers.bcrypt',
    'bcrypt',
    'jose',
    'jose.backends',
    'jose.backends.cryptography_backend',
    'email_validator',
    'pydantic',
    'pydantic_settings',
    'multipart',
    'python_multipart',
    'app',
    'app.api',
    'app.api.api',
    'app.api.deps',
    'app.api.endpoints',
    'app.api.endpoints.auth',
    'app.api.endpoints.products',
    'app.api.endpoints.inventory',
    'app.api.endpoints.suppliers',
    'app.api.endpoints.purchases',
    'app.api.endpoints.customers',
    'app.api.endpoints.sales',
    'app.api.endpoints.returns',
    'app.api.endpoints.reports',
    'app.api.endpoints.analytics',
    'app.api.endpoints.branches',
    'app.api.endpoints.settings',
    'app.api.endpoints.data_integrity',
    'app.api.endpoints.uploads',
    'app.models',
    'app.schemas',
    'app.database',
    'app.database.database',
    'app.core',
    'app.core.config',
    'app.core.security',
    'app.core.timezone',
]

datas = [
    (os.path.join(backend_dir, 'alembic.ini'), '.'),
    (os.path.join(backend_dir, 'alembic'), 'alembic'),
]

a = Analysis(
    [os.path.join(backend_dir, 'server.py')],
    pathex=[backend_dir],
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'unittest', 'pytest', 'IPython'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='medx-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Set to True so logs/errors are visible if invoked, standard for background service
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=os.path.join(backend_dir, '..', 'frontend', 'public', 'appicon.ico') if os.path.exists(os.path.join(backend_dir, '..', 'frontend', 'public', 'appicon.ico')) else None
)
