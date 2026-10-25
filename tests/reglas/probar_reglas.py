"""
Pruebas de firestore.rules con la API de prueba de reglas de Firebase
(firebaserules.googleapis.com …:test). No lee ni escribe datos reales: los documentos
de usuarios y órdenes se simulan con functionMocks de get()/exists().

Uso (desde la raíz del repo, con ADC: gcloud auth application-default login):
  python3 tests/reglas/probar_reglas.py                     # todas las baterías, firestore.rules
  python3 tests/reglas/probar_reglas.py chat externo        # solo esas baterías
  python3 tests/reglas/probar_reglas.py --reglas otro.rules # contra otro archivo de reglas

Sale con código 1 si algún caso falla. Ver docs/migracion/pruebas-aceptacion.md (tipo R).
"""
import json
import subprocess
import sys
import urllib.error
import urllib.request

PROYECTO = 'enar-b2b'
DOCS = '/databases/(default)/documents/'


def mocks_de(perfiles, documentos=None):
    """get()/exists() simulados: usuarios/{uid} con su perfil y documentos extra {ruta: data}."""
    mocks = []
    for uid, data in perfiles.items():
        ruta = DOCS + 'usuarios/' + uid
        mocks.append({'function': 'exists', 'args': [{'exactValue': ruta}], 'result': {'value': True}})
        mocks.append({'function': 'get', 'args': [{'exactValue': ruta}], 'result': {'value': {'data': data}}})
    for ruta, data in (documentos or {}).items():
        mocks.append({'function': 'get', 'args': [{'exactValue': DOCS + ruta}], 'result': {'value': {'data': data}}})
    return mocks


def caso(desc, quien, metodo, ruta, data, esperado, nuevo=None):
    """quien=None: sin sesión. create: data es el documento nuevo. update: data + nuevo."""
    return {'desc': desc, 'quien': quien, 'metodo': metodo, 'ruta': ruta, 'data': data,
            'esperado': esperado, 'nuevo': nuevo}


# ─── Batería: visibilidad de órdenes entre vendedores (2026-10-21) ───
VIS_P = {
    'V': {'rol': 'vendedor', 'estado': 'aprobado', 'email': 'v@test.co'},
    'W': {'rol': 'vendedor', 'estado': 'aprobado', 'email': 'w@test.co'},
    'K': {'rol': 'cliente', 'estado': 'aprobado', 'email': 'k@test.co'},
    'CW': {'rol': 'cliente', 'estado': 'aprobado', 'vendedor_asignado': 'W', 'email': 'cw@test.co'},
    'CV': {'rol': 'cliente', 'estado': 'aprobado', 'vendedor_asignado': 'V', 'email': 'cv@test.co'},
}
_AJENA = {'creadaPor': 'W', 'user_id': 'CW', 'estado': 'pendiente'}
_PROPIA = {'creadaPor': 'V', 'user_id': 'CW', 'estado': 'pendiente'}
_CLIENTE_DE_V = {'creadaPor': 'W', 'user_id': 'CV', 'estado': 'pendiente'}
VISIBILIDAD = {'perfiles': VIS_P, 'casos': [
    caso('V lee orden de otro vendedor (W)', 'V', 'get', 'ordenes/o1', _AJENA, 'ALLOW'),
    caso('V lista órdenes (consulta sin filtros)', 'V', 'list', 'ordenes/o1', _AJENA, 'ALLOW'),
    caso('V cambia el estado de la orden de W', 'V', 'update', 'ordenes/o1', _AJENA, 'DENY', {'estado': 'aprobada'}),
    caso('V edita ítems de la orden de W', 'V', 'update', 'ordenes/o1', _AJENA, 'DENY', {'items': []}),
    caso('V manda a papelera la orden de W', 'V', 'update', 'ordenes/o1', _AJENA, 'DENY', {'eliminado': True}),
    caso('V borra la orden de W', 'V', 'delete', 'ordenes/o1', _AJENA, 'DENY'),
    caso('V cambia el estado de su propia orden', 'V', 'update', 'ordenes/o1', _PROPIA, 'ALLOW', {'estado': 'aprobada'}),
    caso('V cambia el estado de la orden de su cliente asignado', 'V', 'update', 'ordenes/o1', _CLIENTE_DE_V, 'ALLOW', {'estado': 'aprobada'}),
    caso('Control: cliente K lee orden ajena', 'K', 'get', 'ordenes/o1', _AJENA, 'DENY'),
]}

# ─── Batería: despacho, cantidades y mensajes internos (2026-10-24) ───
DES_P = {
    'ADM': {'rol': 'admin', 'estado': 'aprobado', 'email': 'a@test.co'},
    'G': {'rol': 'gestor', 'estado': 'aprobado', 'email': 'g@test.co'},
    'V': {'rol': 'vendedor', 'estado': 'aprobado', 'email': 'v@test.co'},
    'D': {'rol': 'despachos', 'estado': 'aprobado', 'email': 'd@test.co'},
    'K': {'rol': 'cliente', 'estado': 'aprobado', 'email': 'k@test.co'},
    'K2': {'rol': 'cliente', 'estado': 'aprobado', 'email': 'k2@test.co'},
}
_ORDEN_DES = {'user_id': 'K', 'creadaPor': 'V', 'estado': 'terminada',
              'items': [{'cod_interno': 'SD', 'cantidad': 12, 'cantidad_real': 10, 'estado_alistamiento': 'parcial'}]}
_MSG = {'orden_id': 'o1', 'mensaje': 'Comentario interno', 'usuario_id': 'D', 'created_at': '2026-10-24T22:45:19Z'}
DESPACHO = {'perfiles': DES_P, 'documentos': {'ordenes/o1': _ORDEN_DES}, 'casos': [
    caso('Cliente dueño lee su orden (con cantidades despachadas)', 'K', 'get', 'ordenes/o1', _ORDEN_DES, 'ALLOW'),
    caso('Otro cliente lee esa orden', 'K2', 'get', 'ordenes/o1', _ORDEN_DES, 'DENY'),
    caso('Cliente dueño lee mensaje de despacho (get)', 'K', 'get', 'chat_ordenes/m1', _MSG, 'DENY'),
    caso('Cliente dueño consulta mensajes de despacho (list)', 'K', 'list', 'chat_ordenes/m1', _MSG, 'DENY'),
    caso('Cliente dueño escribe un mensaje', 'K', 'create', 'chat_ordenes/m1', _MSG, 'DENY'),
    caso('Admin consulta mensajes', 'ADM', 'list', 'chat_ordenes/m1', _MSG, 'ALLOW'),
    caso('Gestor consulta mensajes', 'G', 'list', 'chat_ordenes/m1', _MSG, 'ALLOW'),
    caso('Vendedor consulta mensajes', 'V', 'list', 'chat_ordenes/m1', _MSG, 'ALLOW'),
    caso('Despachos consulta mensajes', 'D', 'list', 'chat_ordenes/m1', _MSG, 'ALLOW'),
    caso('Admin lee la orden', 'ADM', 'get', 'ordenes/o1', _ORDEN_DES, 'ALLOW'),
    caso('Vendedor lee la orden', 'V', 'get', 'ordenes/o1', _ORDEN_DES, 'ALLOW'),
]}

# ─── Batería: vendedor externo y campos de permisos (2026-10-24) ───
EXT_P = {
    'ADM': {'rol': 'admin', 'estado': 'aprobado', 'email': 'a@test.co'},
    'G': {'rol': 'gestor', 'estado': 'aprobado', 'email': 'g@test.co'},
    'VI': {'rol': 'vendedor', 'estado': 'aprobado', 'email': 'vi@test.co', 'vendedor_externo': False},
    'VS': {'rol': 'vendedor', 'estado': 'aprobado', 'email': 'vs@test.co'},
    'VE': {'rol': 'vendedor', 'estado': 'aprobado', 'email': 've@test.co', 'vendedor_externo': True},
    'D': {'rol': 'despachos', 'estado': 'aprobado', 'email': 'd@test.co'},
    'K': {'rol': 'cliente', 'estado': 'aprobado', 'email': 'k@test.co', 'vendedor_asignado': 'VE'},
}
_O_VE = {'creadaPor': 'VE', 'user_id': 'K', 'estado': 'pendiente'}
_O_VI = {'creadaPor': 'VI', 'user_id': 'K', 'estado': 'pendiente'}
_O_CLI = {'user_id': 'K', 'estado': 'pendiente'}
EXTERNO = {'perfiles': EXT_P, 'casos': [
    caso('Interno lee orden de otro vendedor', 'VI', 'get', 'ordenes/o1', _O_VE, 'ALLOW'),
    caso('Interno lista órdenes sin filtro', 'VI', 'list', 'ordenes/o1', _O_VE, 'ALLOW'),
    caso('Vendedor sin el campo (= interno) lee orden ajena', 'VS', 'get', 'ordenes/o1', _O_VI, 'ALLOW'),
    caso('Externo lee orden que él creó', 'VE', 'get', 'ordenes/o1', _O_VE, 'ALLOW'),
    caso('Externo lista sus órdenes (creadaPor == él)', 'VE', 'list', 'ordenes/o1', _O_VE, 'ALLOW'),
    caso('Externo lee orden de su cliente asignado creada por otro', 'VE', 'get', 'ordenes/o1', _O_VI, 'DENY'),
    caso('Externo lee orden que su cliente creó en el B2B', 'VE', 'get', 'ordenes/o1', _O_CLI, 'DENY'),
    caso('Externo lista órdenes sin filtro (alguna ajena)', 'VE', 'list', 'ordenes/o1', _O_VI, 'DENY'),
    caso('Admin lee cualquier orden', 'ADM', 'get', 'ordenes/o1', _O_VE, 'ALLOW'),
    caso('Gestor lee cualquier orden', 'G', 'get', 'ordenes/o1', _O_VI, 'ALLOW'),
    caso('Despachos lee cualquier orden', 'D', 'get', 'ordenes/o1', _O_VI, 'ALLOW'),
    caso('Cliente lee su orden', 'K', 'get', 'ordenes/o1', _O_VI, 'ALLOW'),
    caso('Externo cambia estado de su orden', 'VE', 'update', 'ordenes/o1', _O_VE, 'ALLOW', {'estado': 'aprobada'}),
    caso('Externo se quita vendedor_externo', 'VE', 'update', 'usuarios/VE', EXT_P['VE'], 'DENY', {'vendedor_externo': False}),
    caso('Vendedor interno quita vendedor_externo a otro', 'VI', 'update', 'usuarios/VE', EXT_P['VE'], 'DENY', {'vendedor_externo': False}),
    caso('Cliente se pone rol admin', 'K', 'update', 'usuarios/K', EXT_P['K'], 'DENY', {'rol': 'admin'}),
    caso('Vendedor pone rol admin a un cliente', 'VI', 'update', 'usuarios/K', EXT_P['K'], 'DENY', {'rol': 'admin'}),
    caso('Vendedor se pone comercial_lider', 'VI', 'update', 'usuarios/VI', EXT_P['VI'], 'DENY', {'comercial_lider': True}),
    caso('Cliente edita su teléfono', 'K', 'update', 'usuarios/K', EXT_P['K'], 'ALLOW', {'telefono': '300'}),
    caso('Vendedor edita datos de un cliente', 'VI', 'update', 'usuarios/K', EXT_P['K'], 'ALLOW', {'telefono': '300'}),
    caso('Admin marca vendedor_externo', 'ADM', 'update', 'usuarios/VI', EXT_P['VI'], 'ALLOW', {'vendedor_externo': True}),
    caso('Gestor cambia rol', 'G', 'update', 'usuarios/K', EXT_P['K'], 'ALLOW', {'rol': 'vendedor'}),
]}

# ─── Batería: mensajes internos solo de órdenes visibles (2026-10-24) ───
CHAT_P = {
    'ADM': {'rol': 'admin', 'email': 'a@test.co'}, 'G': {'rol': 'gestor', 'email': 'g@test.co'},
    'VI': {'rol': 'vendedor', 'email': 'vi@test.co', 'vendedor_externo': False},
    'VE': {'rol': 'vendedor', 'email': 've@test.co', 'vendedor_externo': True},
    'D': {'rol': 'despachos', 'email': 'd@test.co'},
    'K': {'rol': 'cliente', 'estado': 'aprobado', 'email': 'k@test.co'},
}


def _m(orden, quien):
    return {'orden_id': orden, 'mensaje': 'x', 'usuario_id': quien}


CHAT = {'perfiles': CHAT_P,
        'documentos': {'ordenes/oVE': {'creadaPor': 'VE', 'user_id': 'K'}, 'ordenes/oVI': {'creadaPor': 'VI', 'user_id': 'K'}},
        'casos': [
    caso('Externo lee mensaje de su orden', 'VE', 'get', 'chat_ordenes/m1', _m('oVE', 'VE'), 'ALLOW'),
    caso('Externo consulta mensajes de su orden', 'VE', 'list', 'chat_ordenes/m1', _m('oVE', 'VE'), 'ALLOW'),
    caso('Externo lee mensaje de orden ajena', 'VE', 'get', 'chat_ordenes/m1', _m('oVI', 'VE'), 'DENY'),
    caso('Externo consulta mensajes de orden ajena', 'VE', 'list', 'chat_ordenes/m1', _m('oVI', 'VE'), 'DENY'),
    caso('Externo escribe en su orden', 'VE', 'create', 'chat_ordenes/m1', _m('oVE', 'VE'), 'ALLOW'),
    caso('Externo escribe en orden ajena', 'VE', 'create', 'chat_ordenes/m1', _m('oVI', 'VE'), 'DENY'),
    caso('Vendedor interno lee mensaje de cualquier orden', 'VI', 'get', 'chat_ordenes/m1', _m('oVE', 'VI'), 'ALLOW'),
    caso('Vendedor interno escribe en orden de otro', 'VI', 'create', 'chat_ordenes/m1', _m('oVE', 'VI'), 'ALLOW'),
    caso('Admin lee mensajes', 'ADM', 'list', 'chat_ordenes/m1', _m('oVI', 'ADM'), 'ALLOW'),
    caso('Gestor lee mensajes', 'G', 'list', 'chat_ordenes/m1', _m('oVI', 'G'), 'ALLOW'),
    caso('Despachos escribe', 'D', 'create', 'chat_ordenes/m1', _m('oVI', 'D'), 'ALLOW'),
    caso('Cliente dueño de la orden NO lee mensajes', 'K', 'get', 'chat_ordenes/m1', _m('oVI', 'K'), 'DENY'),
    caso('Cliente NO escribe mensajes', 'K', 'create', 'chat_ordenes/m1', _m('oVI', 'K'), 'DENY'),
]}

# ─── Batería: cotizaciones del dueño y del personal (2026-10-25) ───
COT_P = {
    'ADM': {'rol': 'admin', 'email': 'a@test.co'}, 'G': {'rol': 'gestor', 'email': 'g@test.co'},
    'V': {'rol': 'vendedor', 'email': 'v@test.co'}, 'D': {'rol': 'despachos', 'email': 'd@test.co'},
    'K1': {'rol': 'cliente', 'estado': 'aprobado', 'email': 'k1@test.co'},
    'K2': {'rol': 'cliente', 'estado': 'aprobado', 'email': 'k2@test.co'},
}
_C1 = {'numero': 'COT-2026-0001', 'user_id': 'K1', 'total': 1000}
_VIEJA = {'numero': 'COT-2025-0099', 'total': 500}   # anterior a la regla, sin user_id
_R = 'cotizaciones/c1'
COTIZACIONES = {'perfiles': COT_P, 'casos': [
    caso('Cliente crea su cotización (user_id = él)', 'K1', 'create', _R, _C1, 'ALLOW'),
    caso('Cliente crea cotización a nombre de otro', 'K2', 'create', _R, _C1, 'DENY'),
    caso('Cliente crea cotización sin user_id', 'K1', 'create', _R, _VIEJA, 'DENY'),
    caso('Sin sesión crea cotización', None, 'create', _R, _C1, 'DENY'),
    caso('Cliente lee su cotización', 'K1', 'get', _R, _C1, 'ALLOW'),
    caso('Cliente consulta sus cotizaciones (user_id == él)', 'K1', 'list', _R, _C1, 'ALLOW'),
    caso('Otro cliente lee esa cotización', 'K2', 'get', _R, _C1, 'DENY'),
    caso('Otro cliente lista todas las cotizaciones', 'K2', 'list', _R, _C1, 'DENY'),
    caso('Cliente lee cotización antigua sin user_id', 'K1', 'get', _R, _VIEJA, 'DENY'),
    caso('Cliente sobrescribe cotización ajena (mismo ID)', 'K2', 'update', _R, _C1, 'DENY', {'user_id': 'K2', 'total': 1}),
    caso('Cliente modifica su propia cotización', 'K1', 'update', _R, _C1, 'DENY', {'total': 1}),
    caso('Cliente borra su cotización', 'K1', 'delete', _R, _C1, 'DENY'),
    caso('Vendedor lee cualquier cotización', 'V', 'get', _R, _C1, 'ALLOW'),
    caso('Gestor lista cotizaciones', 'G', 'list', _R, _VIEJA, 'ALLOW'),
    caso('Despachos lee cotización', 'D', 'get', _R, _C1, 'ALLOW'),
    caso('Vendedor actualiza estado de cotización', 'V', 'update', _R, _C1, 'ALLOW', {'estado': 'aprobada'}),
    caso('Admin borra cotización', 'ADM', 'delete', _R, _C1, 'ALLOW'),
    caso('Vendedor borra cotización', 'V', 'delete', _R, _C1, 'DENY'),
]}

BATERIAS = {'visibilidad': VISIBILIDAD, 'despacho': DESPACHO, 'externo': EXTERNO,
            'chat': CHAT, 'cotizaciones': COTIZACIONES}


def a_test_case(c, perfiles, mocks):
    req = {'path': DOCS + c['ruta'], 'method': c['metodo']}
    if c['quien']:
        req['auth'] = {'uid': c['quien'], 'token': {'email': perfiles[c['quien']]['email']}}
    tc = {'expectation': c['esperado'], 'request': req, 'functionMocks': mocks}
    if c['metodo'] == 'create':
        req['resource'] = {'data': c['data']}
    else:
        tc['resource'] = {'data': c['data']}
        if c['nuevo'] is not None:
            req['resource'] = {'data': {**c['data'], **c['nuevo']}}
    return tc


def probar(reglas, nombre, bateria, token):
    mocks = mocks_de(bateria['perfiles'], bateria.get('documentos'))
    body = {'source': {'files': [{'name': 'firestore.rules', 'content': reglas}]},
            'testSuite': {'testCases': [a_test_case(c, bateria['perfiles'], mocks) for c in bateria['casos']]}}
    req = urllib.request.Request(
        f'https://firebaserules.googleapis.com/v1/projects/{PROYECTO}:test', data=json.dumps(body).encode(),
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'x-goog-user-project': PROYECTO})
    try:
        res = json.load(urllib.request.urlopen(req, timeout=60))
    except urllib.error.HTTPError as e:
        print(f'[{nombre}] error de la API: {e.read().decode()[:800]}')
        return len(bateria['casos'])
    if res.get('issues'):
        print(f'[{nombre}] avisos de compilación: {json.dumps(res["issues"])[:600]}')
    fallos = 0
    print(f'\n== {nombre} ({len(bateria["casos"])} casos)')
    for c, t in zip(bateria['casos'], res['testResults']):
        ok = t.get('state') == 'SUCCESS'
        fallos += not ok
        print(f"  {'✓' if ok else '✗'} {c['esperado']:5} {c['desc']}")
    return fallos


def main(args):
    archivo = 'firestore.rules'
    if '--reglas' in args:
        i = args.index('--reglas')
        archivo = args[i + 1]
        args = args[:i] + args[i + 2:]
    nombres = args or list(BATERIAS)
    reglas = open(archivo, encoding='utf-8').read()
    token = subprocess.check_output(['gcloud', 'auth', 'application-default', 'print-access-token'], text=True).strip()
    total = sum(len(BATERIAS[n]['casos']) for n in nombres)
    fallos = sum(probar(reglas, n, BATERIAS[n], token) for n in nombres)
    print(f'\n{total - fallos}/{total} correctas' + ('' if not fallos else f' — {fallos} FALLOS'))
    return 1 if fallos else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
