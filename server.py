# server.py
import os, json, uuid, base64
from http.server import HTTPServer, SimpleHTTPRequestHandler
from datetime import datetime
import mimetypes
import smtplib
import urllib.request
import urllib.parse
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

PORT = 8000
FOTOS_DIR = 'fotos'
os.makedirs(FOTOS_DIR, exist_ok=True)

mimetypes.add_type('text/javascript', '.js')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('image/x-icon', '.ico')


class Handler(SimpleHTTPRequestHandler):

    def do_POST(self):
        if self.path == '/upload-foto':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)

                print('--- /upload-foto ---')
                print('Bytes recibidos:', content_length)

                data = json.loads(body.decode())
                parte_id = data['parte_id']
                img_data = data['base64']

                if ',' in img_data:
                    img_data = img_data.split(',', 1)[1]

                # quitar saltos de línea y spaces que a veces trae el base64
                img_data = ''.join(img_data.split())
                # soportar base64 url-safe
                img_data = img_data.replace('-', '+').replace('_', '/')
                # rellenar padding si falta
                img_data += '=' * (-len(img_data) % 4)

                raw = base64.b64decode(img_data)
                print('Bytes imagen tras decodificar:', len(raw))

                fname = f"{parte_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}.jpg"
                dest = os.path.abspath(os.path.join(FOTOS_DIR, fname))
                with open(dest, 'wb') as f:
                    f.write(raw)

                print('Guardado en:', dest)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'url': f'/fotos/{fname}'}).encode())

            except Exception as e:
                import traceback
                traceback.print_exc()
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())

        elif self.path == '/send-email':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                data = json.loads(body.decode())

                action = data.get('action')
                config = data.get('config', {})

                if action == 'test':
                    # Probar conexión SMTP
                    result = self.test_smtp_connection(config)
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps(result).encode())
                elif action == 'send':
                    # Enviar email real
                    to_email = data.get('to')
                    subject = data.get('subject')
                    body = data.get('body')
                    # Acuse de recibo: activado por defecto
                    with_acuse = data.get('acuse', True)
                    result = self.send_email(config, to_email, subject, body, with_acuse)
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps(result).encode())
                else:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': 'Acción no válida'}).encode())

            except Exception as e:
                import traceback
                traceback.print_exc()
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def test_smtp_connection(self, config):
        """Prueba la conexión al servidor SMTP"""
        try:
            host = config.get('host')
            port = config.get('port', 587)
            user = config.get('user')
            password = config.get('password')
            secure = config.get('secure', False)

            if not all([host, user, password]):
                return {'success': False, 'error': 'Faltan datos de configuración'}

            print(f'Probando conexión SMTP: {host}:{port}')

            if secure:
                server = smtplib.SMTP_SSL(host, port)
            else:
                server = smtplib.SMTP(host, port)
                server.starttls()

            server.login(user, password)
            server.quit()

            print('Conexión SMTP exitosa')
            return {'success': True, 'message': 'Conexión exitosa'}

        except Exception as e:
            print(f'Error conexión SMTP: {e}')
            return {'success': False, 'error': str(e)}

    def send_email(self, config, to_email, subject, body, with_acuse=True):
        """Envía un email usando la configuración SMTP"""
        try:
            host = config.get('host')
            port = config.get('port', 587)
            user = config.get('user')
            password = config.get('password')
            secure = config.get('secure', False)

            if not all([host, user, password, to_email, subject]):
                return {'success': False, 'error': 'Faltan datos requeridos'}

            print(f'Enviando email a {to_email} via {host}:{port}')

            msg = MIMEMultipart()
            msg['From'] = user
            msg['To'] = to_email
            msg['Subject'] = subject
            msg.attach(MIMEText(body, 'plain'))

            # ── Acuse de recibo / lectura (RFC 3798): el cliente de correo del
            #    destinatario preguntará "el remitente pide confirmación de lectura".
            #    Cuando el cliente confirme, llegará UN EMAIL a la casilla 'user'
            #    con asunto "Confirmación de lectura" — señal para administración.
            if with_acuse:
                msg['Disposition-Notification-To'] = user
                msg['Return-Receipt-To'] = user          # legado (algunos clientes lo usan)
                msg['X-Confirm-Reading-To'] = user       # otro alias legacy

            if secure:
                server = smtplib.SMTP_SSL(host, port)
            else:
                server = smtplib.SMTP(host, port)
                server.starttls()

            server.login(user, password)
            server.send_message(msg)
            server.quit()

            print('Email enviado exitosamente')
            return {'success': True, 'message': 'Email enviado'}

        except Exception as e:
            print(f'Error enviando email: {e}')
            return {'success': False, 'error': str(e)}

    def do_GET(self):
        # ── Proxy de geocodificación: Nominatim bloquea CORS desde el navegador ──
        if self.path.startswith('/geocode?'):
            try:
                q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('q', [''])[0]
                if not q:
                    raise ValueError('Falta q')
                url = ('https://nominatim.openstreetmap.org/search?format=json&limit=5'
                       '&addressdetails=1&countrycodes=es&q=' + urllib.parse.quote(q))
                req = urllib.request.Request(url, headers={
                    'User-Agent': 'AutoPuertaPro/1.0 (uso interno; contacto: admin@valgomdoors.com)',
                    'Accept-Language': 'es'
                })
                with urllib.request.urlopen(req, timeout=10) as r:
                    data = r.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                self.send_response(502)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
            return
        if self.path.startswith('/fotos/') and self.path.endswith('.jpg'):
            fname = os.path.basename(self.path.split('/')[-1])
            fpath = os.path.abspath(os.path.join(FOTOS_DIR, fname))
            if os.path.exists(fpath):
                self.send_response(200)
                self.send_header('Content-Type', 'image/jpeg')
                self.send_header('Cache-Control', 'public, max-age=3600')
                self.end_headers()
                with open(fpath, 'rb') as f:
                    self.wfile.write(f.read())
                return
            else:
                self.send_response(404)
                self.end_headers()
                return

        # Servir el resto de archivos como antes
        super().do_GET()

    def log_message(self, format, *args):
        pass


class Server(HTTPServer):
    def handle_error(self, request, client_address):
        pass


# CAMBIO AQUÍ: '0.0.0.0' en vez de '127.0.0.1'
print(f'Server AutoPuerta Pro: http://0.0.0.0:{PORT}')
print(f'Carpeta fotos/: {os.path.abspath(FOTOS_DIR)}')
print(f'Servicio de correo SMTP habilitado')
Server(('0.0.0.0', PORT), Handler).serve_forever()