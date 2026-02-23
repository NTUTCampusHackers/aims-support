import sqlite3
import json

# 1. データベースファイルに接続
db_file = 'courses.db'
json_file = 'courses.json'
table_name = 'courses' # ※実際のテーブル名に変更してください

def convert_db_to_json():
    try:
        # DBに接続し、カラム名をキーとして取得できるように設定
        conn = sqlite3.connect(db_file)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # 2. データを全件取得
        cursor.execute(f"SELECT * FROM {table_name}")
        rows = cursor.fetchall()

        # 3. 取得したデータを辞書（Dictionary）のリストに変換
        data_list = [dict(row) for row in rows]

        # 4. JSONファイルとして書き出し
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(data_list, f, ensure_ascii=False, indent=2)

        print(f"成功: {len(data_list)}件のデータを {json_file} に書き出しました。")

    except sqlite3.OperationalError as e:
        print(f"データベースエラー: {e}")
        print("指定したファイルやテーブル名が存在しない可能性があります。")
    except Exception as e:
        print(f"予期せぬエラー: {e}")
    finally:
        # 接続を閉じる
        if conn:
            conn.close()

if __name__ == "__main__":
    convert_db_to_json()
