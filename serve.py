#!/usr/bin/env python3
"""
同じ Wi-Fi につないだスマホから遊ぶためのローカルサーバー。

インターネットには一切公開されない。動くのは自宅（や職場）のネットワークの中だけで、
外から見られることはない。

    python3 serve.py            # ポート 8000 で起動
    python3 serve.py 9000       # ポートを変えたいとき

起動すると、スマホのブラウザに打ち込む URL が表示される。
"""

import functools
import http.server
import socket
import socketserver
import sys
from pathlib import Path

DEFAULT_PORT = 8000
ROOT = Path(__file__).resolve().parent


def lan_addresses():
    """このPCが LAN 上で名乗っている IPv4 アドレスを集める"""
    found = []

    # 外向きの経路に使われるアドレスを調べる。UDP なので実際の通信は発生しない。
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            probe.connect(("8.8.8.8", 80))
            found.append(probe.getsockname()[0])
        finally:
            probe.close()
    except OSError:
        pass

    # 有線と無線の両方につながっている場合など、他にもあれば拾う
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127.") and ip not in found:
                found.append(ip)
    except OSError:
        pass

    return found


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # 開発中はキャッシュされると変更が反映されず混乱するので毎回読み直させる
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        # 404 だけ出す。全リクエストを流すとうるさい。
        if args and str(args[1]).startswith("4"):
            super().log_message(fmt, *args)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f"ポート番号が数字ではありません: {sys.argv[1]}")
            return 1

    handler = functools.partial(Handler, directory=str(ROOT))

    try:
        httpd = Server(("0.0.0.0", port), handler)
    except OSError as e:
        print(f"ポート {port} を使えませんでした: {e}")
        print(f"別のポートを試してください  →  python3 {Path(__file__).name} {port + 1}")
        return 1

    ips = lan_addresses()

    print()
    print("=" * 52)
    print("  ポケットモンスター ― ドットのぼうけん")
    print("=" * 52)
    print()
    print("  このPCで遊ぶ:")
    print(f"      http://localhost:{port}")
    print()
    if ips:
        print("  同じ Wi-Fi のスマホで遊ぶ（この URL を入力）:")
        for ip in ips:
            print(f"      http://{ip}:{port}")
    else:
        print("  LAN の IP アドレスを取得できませんでした。")
        print("  ipconfig (Windows) / ifconfig (Mac・Linux) で確認してください。")
    print()
    print(f"  テスト: http://localhost:{port}/tests.html")
    print()
    print("  ※ インターネットには公開されません。同じ Wi-Fi の中だけです。")
    print("  ※ つながらないときは、PCのファイアウォールで Python の通信を")
    print("     許可してください。ゲスト用 Wi-Fi は端末同士の通信を")
    print("     遮断していることがあるので、その場合は通常の Wi-Fi へ。")
    print()
    print("  Ctrl+C で終了")
    print()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n終了しました。")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
