"""
PNG图片优化工具
使用optipng和oxipng对PNG图片进行优化处理，并记录优化结果
"""
import hashlib 
import json
import os
import pathlib  
import re
import struct 
from argparse import ArgumentParser  

import numpy as np 
from PIL import Image 
from tqdm import tqdm


def remove_auxiliary_data(input_file, output_file):
    """
    移除PNG图片中的辅助数据，只保留关键块
    PNG图片由多个数据块组成，此函数只保留IHDR、PLTE、IDAT和IEND块
    """
    with open(input_file, "rb") as f:
        data = f.read()

    output_data = bytearray()
    output_data.extend(data[:8])  # PNG signature

    # Locate and copy critical chunks
    start = 8
    while start < len(data):
        length, chunk_type = struct.unpack(">I4s", data[start : start + 8])
        start += 8
        chunk_data = data[start : start + length]
        start += length
        crc = data[start : start + 4]
        start += 4

        if chunk_type in [b"IHDR", b"PLTE", b"IDAT", b"IEND"]:
            output_data.extend(struct.pack(">I4s", length, chunk_type))
            output_data.extend(chunk_data)
            output_data.extend(crc)

    with open(output_file, "wb") as f:
        f.write(output_data)


def get_file_id(file_path: str):
    file_id = file_path.replace("\\", "/")

    # docs\\.vuepress\\public\\image\\PATH\\TO\\xxx.png -> docs/PATH/TO/xxx
    m = re.search(r"docs/.vuepress/public/images/(.*)\.png", file_id)
    if m:
        return f"docs/{m.group(1)}"

    return None


def check_png_need_update(file_path: str, perfect_pngs: dict, quiet: bool):
    """
    检查PNG图片是否需要更新优化
    如果图片的sha256值与perfect_pngs中记录的不一致，则认为需要更新
    """
    # convert to absolute path
    file_path = str(pathlib.Path(file_path).resolve())

    if not file_path.endswith(".png"):
        return False

    file_id = get_file_id(file_path)
    if not file_id:
        print("unknown file path", file_path)
        return False

    if file_id in perfect_pngs:
        with open(file_path, "rb") as f:
            data = f.read()
            sha256 = hashlib.sha256(data).hexdigest()
            if sha256 == perfect_pngs[file_id]:
                if not quiet:
                    print("skip", file_path)
                return False

    return True


def update_png_with_optipng(file_path: str, perfect_pngs: dict, quiet: bool):
    """
    使用optipng对PNG图片进行优化处理，并记录优化结果
    """
    if check_png_need_update(file_path, perfect_pngs, quiet):
        if not quiet:
            print("updating", file_path)
    else:
        return False

    file_path = str(pathlib.Path(file_path).resolve())
    file_id = get_file_id(file_path)
    sz_before = os.stat(file_path).st_size

    input_file = output_file = file_path
    remove_auxiliary_data(input_file, output_file)
    # -quiet: 禁止除错误以外的所有输出
    # -o7: 最大优化级别
    # -zm1-9: 压缩级别1到9
    # -fix: 修复损坏的PNG文件
    if quiet:
        os.system(f'optipng -quiet -o7 -zm1-9 -fix "{output_file}"')
    else:
        os.system(f'optipng -o7 -zm1-9 -fix "{output_file}"')

    sz_after = os.stat(file_path).st_size

    if not quiet:
        print(
            f"before: {sz_before} Bytes, after: {sz_after} Bytes, diff: {sz_before - sz_after} Bytes"
        )

    # update file sha256
    with open(file_path, "rb") as f:
        data = f.read()
        sha256 = hashlib.sha256(data).hexdigest()
        perfect_pngs.update({file_id: sha256})

    if not quiet:
        print("updated", file_path)
    update_perfect_png_dict(perfect_pngs)
    return sz_before - sz_after


def update_png_with_oxipng(file_path: str, perfect_pngs: dict, quiet: bool):
    """
    使用oxipng对PNG图片进行优化处理，并记录优化结果
    """
    if check_png_need_update(file_path, perfect_pngs, quiet):
        if not quiet:
            print("updating", file_path)
    else:
        return False

    file_path = str(pathlib.Path(file_path).resolve())
    file_id = get_file_id(file_path)
    sz_before = os.stat(file_path).st_size

    img_before = np.array(Image.open(file_path).convert("L"))

    if quiet:
        os.system(f'oxipng -o max --fast -Z -s -q "{file_path}"')
        os.system(f'oxipng -o 2 -s -q "{file_path}"')
    else:
        os.system(f'oxipng -o max --fast -Z -s "{file_path}"')
        os.system(f'oxipng -o 2 -s "{file_path}"')

    sz_after = os.stat(file_path).st_size

    if not quiet:
        print(
            f"before: {sz_before} Bytes, after: {sz_after} Bytes, diff: {sz_before - sz_after} Bytes"
        )

    # update file sha256
    with open(file_path, "rb") as f:
        data = f.read()
        sha256 = hashlib.sha256(data).hexdigest()
        perfect_pngs.update({file_id: sha256})

    img_after = np.array(Image.open(file_path).convert("L"))
    if not (img_before == img_after).all():
        return -1

    if not quiet:
        print("updated", file_path)
    update_perfect_png_dict(perfect_pngs)
    return sz_before - sz_after


cur_dir = pathlib.Path(__file__).parent.resolve()
perfect_pngs_path = str(cur_dir / "optimize_templates.json")


def update_perfect_png_dict(perfect_pngs: dict):
    with open(perfect_pngs_path, "w") as f:
        json.dump(perfect_pngs, f, indent=4)


def ArgParser():
    parser = ArgumentParser()
    parser.add_argument(
        "-p",
        "--path",
        dest="path",
        nargs="*",
        help="the paths of png files or folders",
        default=[],
    )
    parser.add_argument("-q", "--quiet", dest="quiet", action="store_true")
    return parser


if __name__ == "__main__":
    args = ArgParser().parse_args()
    paths = args.path
    quiet = args.quiet

    perfect_pngs = {}
    optimized_png_paths = []

    if os.path.exists(perfect_pngs_path):
        with open(perfect_pngs_path, "r") as f:
            perfect_pngs = json.load(f)

    if len(paths) == 0:
        docs_dir = cur_dir.parent.parent / "docs"
        paths = [
            str(docs_dir),
        ]
        print("no path specified, use default paths:", paths)

    files = []
    tqdm_total = 0

    for path in paths:
        if pathlib.Path(path).is_dir():
            for root, _, _files in os.walk(path):
                for f in _files:
                    file = os.path.join(root, f)
                    if check_png_need_update(file, perfect_pngs, quiet):
                        files.append(file)
                        tqdm_total += os.stat(file).st_size ** 2 // 2**20
        elif pathlib.Path(path).is_file():
            files.append(path)
            tqdm_total += os.stat(path).st_size ** 2 // 2**20

    total_diff_sz = 0
    if quiet:
        t = tqdm(files, total=tqdm_total)
    for i, file in enumerate(files):
        cur_file_sz = os.stat(file).st_size
        diff_sz = update_png_with_oxipng(file, perfect_pngs, quiet)
        if diff_sz == -1:
            print("error.")
            exit(-1)
        if diff_sz:
            total_diff_sz += diff_sz
            optimized_png_paths.append(file)

        if total_diff_sz < 1024:
            total_diff_sz_str = f"{total_diff_sz} Bytes"
        elif total_diff_sz < 1048576:
            total_diff_sz_str = f"{(total_diff_sz / 1024):.2f} KiB"
        else:
            total_diff_sz_str = f"{(total_diff_sz / 1048576):.2f} MiB"

        if quiet:
            t.update(cur_file_sz**2 // 2**20)
            t.set_postfix(
                file_counts=f"{i+1}/{len(files)}", reduced_size=total_diff_sz_str
            )
            t.refresh()
        else:
            print(
                f"file counts: {i+1}/{len(files)}, reduced pngs size: {total_diff_sz_str}"
            )
