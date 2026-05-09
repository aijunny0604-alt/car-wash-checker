"""no-cache 정적 서버. 'python serve.py' 또는 'python serve.py 8080'.

브라우저 캐시 때문에 수정사항이 안 보이는 문제 해결용.
모든 응답에 Cache-Control: no-store 헤더를 붙여 강제 무효화.
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print(f'no-cache 서버 시작 → http://localhost:{port}')
    print('Ctrl+C 로 종료')
    ThreadingHTTPServer(('', port), NoCacheHandler).serve_forever()
