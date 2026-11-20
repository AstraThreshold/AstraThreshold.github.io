"""Build the as-assembled astraCore mesh from placed STEP packages.

Usage: python simulator/tools/core_mesh.py .research/core-models
Requires OpenCascade Python bindings (OCP 7.8). All coordinates are millimeters.
Model origins and axes are normalized before placing them on the board faces.
"""
import argparse
import hashlib
import json
import math
import struct
from functools import cache
from pathlib import Path

from OCP.BRep import BRep_Tool
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeFace, BRepBuilderAPI_MakePolygon
from OCP.BRepLib import BRepLib_ToolTriangulatedShape
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder, BRepPrimAPI_MakePrism
from OCP.gp import gp_Ax2, gp_Dir, gp_Pnt, gp_Vec
from OCP.IFSelect import IFSelect_RetDone
from OCP.Quantity import Quantity_Color, Quantity_TOC_sRGB
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TCollection import TCollection_ExtendedString
from OCP.TDF import TDF_LabelSequence
from OCP.TDocStd import TDocStd_Document
from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS
from OCP.XCAFDoc import XCAFDoc_ColorGen, XCAFDoc_ColorSurf, XCAFDoc_DocumentTool

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / 'simulator/models'
WIDTH, HEIGHT, THICKNESS, GLASS = 36.4, 26.3, 1.6, 1.22
TIN, GOLD, BLACK, CREAM = (194, 197, 189), (189, 142, 66), (41, 42, 42), (229, 224, 204)


def box(x, y, width, height, z, thickness):
    return BRepPrimAPI_MakeBox(gp_Pnt(x - width / 2, y - height / 2, z), width, height, thickness).Shape()


def disk(x, y, z, diameter, height):
    return BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x, y, z), gp_Dir(0, 0, 1)), diameter / 2, height).Shape()


def chamfered(width, height, z, thickness, bevel):
    x, y = width / 2, height / 2
    polygon = BRepBuilderAPI_MakePolygon()
    for px, py in [(-x+bevel,-y),(x-bevel,-y),(x,-y+bevel),(x,y-bevel),
                   (x-bevel,y),(-x+bevel,y),(-x,y-bevel),(-x,-y+bevel)]:
        polygon.Add(gp_Pnt(px, py, z))
    polygon.Close()
    return BRepPrimAPI_MakePrism(BRepBuilderAPI_MakeFace(polygon.Wire()).Face(), gp_Vec(0, 0, thickness)).Shape()


def clip_hole(shape, x, y, z, diameter, height):
    return BRepAlgoAPI_Cut(shape, disk(x, y, z, diameter, height)).Shape()


def faces_of(shape):
    # This deflection resolves SMT leads and beveled edges at the displayed size.
    BRepMesh_IncrementalMesh(shape, .055, False, .65, False)
    explorer = TopExp_Explorer(shape, TopAbs_FACE)
    while explorer.More():
        face = TopoDS.Face_s(explorer.Current())
        explorer.Next()
        loc = TopLoc_Location()
        mesh = BRep_Tool.Triangulation_s(face, loc)
        if mesh is None:
            continue
        BRepLib_ToolTriangulatedShape.ComputeNormals_s(face, mesh)
        tr = loc.Transformation()
        reversed_face = face.Orientation() == TopAbs_REVERSED
        nodes = []
        for i in range(1, mesh.NbNodes() + 1):
            p = mesh.Node(i).Transformed(tr).Coord()
            n = mesh.Normal(i).Transformed(tr).Coord()
            nodes.append((p, tuple(-v for v in n) if reversed_face else n))
        indices = [tuple(i - 1 for i in mesh.Triangle(j).Get()) for j in range(1, mesh.NbTriangles()+1)]
        if reversed_face:
            indices = [(a, c, b) for a, b, c in indices]
        yield face, nodes, indices


def color_for(color_tool, face):
    color = Quantity_Color()
    if color_tool.GetColor(face, XCAFDoc_ColorSurf, color) or color_tool.GetColor(face, XCAFDoc_ColorGen, color):
        rgb = tuple(round(v * 255) for v in color.Values(Quantity_TOC_sRGB))
        # Matched from source colors so bodies, solder, and pin-one marks remain distinct.
        metal = rgb in [(210, 209, 199), (219, 188, 126), (95, 95, 95)]
        if rgb in [(38, 37, 37), (37, 36, 36)]:
            rgb = (63, 61, 58)
        elif rgb == (176, 169, 152):
            rgb = (48, 46, 43)
        return rgb, (180 if metal else 40)
    return (122, 122, 113), 110


def normalize(nodes, turn, center, scales):
    for p, n in nodes:
        x, y, z = p[0] - center[0], p[1] - center[1], p[2] - center[2]
        nx, ny, nz = n
        # Convert each STEP's Y-up drawing plane to the photo's Y-down board coordinates.
        if turn:
            x, y, nx, ny = -y, x, -ny, nx
        yield (x * scales[0], -y * scales[1], z * scales[2]), (nx / scales[0], -ny / scales[1], nz / scales[2])


def load_step(kind, path):
    reader = STEPCAFControl_Reader()
    if reader.ReadFile(str(path)) != IFSelect_RetDone:
        raise ValueError(f'Cannot read {path.name}')
    doc = TDocStd_Document(TCollection_ExtendedString('XCAF'))
    if not reader.Transfer(doc):
        raise ValueError(f'Cannot transfer {path.name}')
    shapes = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    colors = XCAFDoc_DocumentTool.ColorTool_s(doc.Main())
    roots = TDF_LabelSequence()
    shapes.GetFreeShapes(roots)
    geometry = [(nodes, tris, color_for(colors, face))
                for index in range(1, roots.Length()+1)
                for face, nodes, tris in faces_of(shapes.GetShape_s(roots.Value(index)))]
    coordinates = list(zip(*(p for nodes, _, _ in geometry for p, _ in nodes)))
    lo, hi = [min(axis) for axis in coordinates], [max(axis) for axis in coordinates]
    extent = [b-a for a,b in zip(lo,hi)]
    center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]]
    turn = kind == 'sh4' and extent[1] > extent[0]
    if turn:
        extent[0], extent[1] = extent[1], extent[0]
    target = {
        'qfn': (7, 7, .55), 'soic': (8, 5.3, 1.9),
        'sh4': (6, 5.15, 2.9), 'side': (4.9, 4.0, 1.8), 'ind': (3, 3, 1.1),
        'led0603': (1.6, .8, .64), 'led0805': (2.0, 1.25, .7),
    }.get(kind, extent)
    scales = [a/b for a,b in zip(target,extent)]
    mesh = []
    for nodes, tris, (rgb, polish) in geometry:
        # Adapt the SOIC body to the wide Winbond package and keep the 1.27 mm lead pitch.
        face_scale = (scales[0], 1, scales[2]) if kind == 'soic' and polish == 180 else scales
        mesh.append((list(normalize(nodes, turn, center, face_scale)), tris, rgb, polish, 0))
    if kind == 'side':
        # The installed part has an amber insert visible through the metal cover.
        rim = BRepAlgoAPI_Cut(box(0, .12, 2.42, 2.13, 1.76, .12), box(0, .12, 1.65, 1.38, 1.74, .2)).Shape()
        insert = box(0, .12, 1.65, 1.38, 1.77, .06)
        for shape, tint in [(rim, (195, 167, 53)), (insert, (140, 111, 27))]:
            mesh.extend((nodes, tris, tint, 100, 0) for _, nodes, tris in faces_of(shape))
    return mesh, target[:2]


def custom(kind):
    pieces = []

    def put(shape, rgb, polish=38, plunger=0):
        pieces.append((shape, rgb, polish, plunger))

    if kind == 'oled':
        put(chamfered(35.8, 17.1, 0, .58, .13), (23, 28, 26), 100)
        put(chamfered(35.78, 17.08, .58, .61, .13), (28, 34, 33), 180)
        put(box(1, 0, 33.68, 16.7, 1.19, .025), (17, 22, 23), 140)
        put(box(-16.85, 0, 1.96, 16.96, 1.19, .03), (15, 19, 18), 58)
        # The display's active surface lines up with the live HTML pixel plane.
        put(box(1.41, 0, 29.42, 14.71, 1.215, .005), (4, 8, 10), 58)
        for sign in (-1, 1):
            put(box(1.41, sign * 7.433, 29.64, .09, 1.217, .009), (83, 101, 101), 136)
            put(box(1.41 + sign * 14.788, 0, .09, 14.82, 1.217, .009), (83, 101, 101), 136)
        for y in (-4.25, 3.75):
            put(box(-17.94, y, .22, .9, .45, .33), (151, 102, 46), 100)
        size = (35.8, 17.1)
    elif kind == 'tact':
        put(chamfered(3.08, 2.55, .06, .80, .14), (52, 55, 46))
        cover = chamfered(3.0, 2.5, .84, .63, .16)
        put(clip_hole(cover, 0, 0, .8, 1.78, .75), TIN, 212)
        put(disk(0, 0, 1.20, 1.7, .72), BLACK, 53, 1)
        put(disk(0, 0, 1.92, 1.59, .08), (50, 50, 48), 62, 1)
        for side in (-1, 1):
            put(box(side * 1.78, 0, 1.0, 1.27, .06, .15), TIN, 186)
            put(box(side * 1.48, 0, .24, 1.1, .19, .67), TIN, 186)
        size = (3, 2.5)
    elif kind == 'buzzer':
        case = chamfered(5, 5, .08, 1.92, .27)
        put(clip_hole(case, 0, -1.48, 1.35, .8, .75), (47, 49, 47), 43)
        put(disk(0, -1.48, 1.35, .78, .012), (15, 15, 15))
        put(disk(-1.65, 1.68, 2, .60, .01), (30, 30, 29))
        for x, y in [(-2.3, -1.75), (-2.3, 1.75), (2.3, 1.75)]:
            put(box(x, y, 1.68, .68, .04, .15), TIN, 178)
        size = (5, 5)
    elif kind == 'btb':
        # X0812WVS 12-contact male connector. Two keyed contact channels and formed feet.
        put(chamfered(4.0, 6.65, .10, .55, .2), (43, 39, 37), 52)
        for side in (-1, 1):
            put(box(side * 1.74, 0, .52, 6.55, .65, 1.12), (43, 38, 36), 50)
            put(box(0, side * 3.01, 3.0, .58, .65, 1.14), (50, 43, 40), 50)
        put(chamfered(1.64, 5.47, .65, 1.0, .14), (38, 34, 31), 55)
        for index in range(6):
            y = (index - 2.5) * .8
            for side in (-1, 1):
                put(box(side * 2.05, y, .76, .30, .035, .11), TIN, 200)
                put(box(side * 1.93, y, .18, .27, .105, .53), TIN, 200)
                put(box(side * .84, y, .16, .28, 1.13, .50), GOLD, 216)
                put(box(side * .95, y, .36, .28, .65, .15), GOLD, 191)
        size = (4, 6.65)
    elif kind == 'sh4':
        put(box(0, 0, 6.0, 4.25, .08, .53), CREAM, 76)
        roof = chamfered(6.0, 4.25, 2.18, .71, .16)
        for x in (-2.44, 2.44):
            latch = box(x, 1.44, .36, 1.42, 2.67, .25)
            roof = BRepAlgoAPI_Cut(roof, latch).Shape()
        put(roof, CREAM, 82)
        for x in (-2.70, 2.70):
            put(box(x, 0, .60, 4.25, .61, 1.57), CREAM, 73)
            put(box(x, 1.38, .33, 1.12, .06, 1.1), TIN, 196)
        put(box(0, -1.90, 4.8, .45, .61, 1.57), CREAM, 70)
        for index in range(4):
            x = (index - 1.5) * 1.016
            put(box(x, -2.46, .31, 1.22, .035, .13), TIN, 195)
            put(box(x, -2.23, .28, .19, .10, .80), TIN, 185)
            put(box(x, -.40, .27, 3.14, .64, .13), GOLD, 225)
        size = (6, 4.25)
    elif kind == 'ws2812':
        put(chamfered(2.0, 2.0, .0, .48, .07), (219, 213, 198), 55)
        put(disk(0, 0, .48, 1.52, .31), (231, 224, 209), 110)
        put(box(.06, .12, .35, .34, .79, .035), (202, 195, 178), 104)
        for x in (-.74, .74):
            for y in (-.56, .56):
                put(box(x, y, .85, .58, .03, .12), TIN, 195)
        size = (2, 2)
    elif kind == 'ind':
        put(chamfered(3.0, 3.0, .06, 1.02, .40), (89, 86, 82), 56)
        put(chamfered(2.65, 2.65, 1.08, .08, .61), (105, 102, 99), 66)
        for x in (-1.19, 1.19):
            put(box(x, 0, 1.14, 2.75, .025, .13), TIN, 168)
        size = (3, 3)
    else:
        raise ValueError(f'Missing model for {kind}')
    return ([(nodes, tris, rgb, polish, press) for shape, rgb, polish, press in pieces
             for _, nodes, tris in faces_of(shape)], size)


class Mesh:
    def __init__(self):
        self.vertices = bytearray()
        self.indices = []
        self.unique = {}
        self.shadows = []

    def add_face(self, nodes, triangles, rgb, polish, surface=0, pressed=0):
        mapped = []
        for p, n in nodes:
            length = math.sqrt(sum(v*v for v in n)) or 1
            pos = [round(v * 100) for v in p]
            norm = [round(v * 127 / length) for v in n]
            key = struct.pack('<3h3b3B3Bx', *pos, *norm, *rgb, surface, polish, pressed)
            index = self.unique.get(key)
            if index is None:
                index = len(self.unique)
                self.unique[key] = index
                self.vertices.extend(key)
            mapped.append(index)
        self.indices.extend(mapped[i] for t in triangles for i in t)

    def board(self):
        sheet = chamfered(WIDTH, HEIGHT, -GLASS - THICKNESS, THICKNESS, .105)
        # Four tooling bores from the board outline Gerber.
        for x, y in [(2.796,1.555),(2.796,7.356),(33.653,18.949),(33.653,24.750)]:
            sheet = clip_hole(sheet, x-WIDTH/2, y-HEIGHT/2, -3, .65, 2)
        for _, nodes, triangles in faces_of(sheet):
            z = nodes[0][1][2]
            surface = (1 if z > 0 else 2) if abs(z) > .99 else 0
            color = (84, 94, 64) if not surface else (255, 255, 255)
            self.add_face(nodes, triangles, color, 62, surface=surface)

    def place(self, ref, side, x, y, angle, package):
        geometry, size = package
        co, si = math.cos(math.radians(angle)), math.sin(math.radians(angle))
        front = side == 'front'
        sign = 1 if front else -1
        surface_z = -GLASS if front else -GLASS - THICKNESS
        self.shadows.extend((1 if front else 2, x, y, *size, angle))
        for nodes, triangles, color, polish, press in geometry:
            def world(point, normal):
                px, py, pz = point
                nx, ny, nz = normal
                return (((x + px * co - py * si - WIDTH / 2) * sign,
                         y + px * si + py * co - HEIGHT / 2, surface_z + pz * sign),
                        ((nx * co - ny * si) * sign, nx * si + ny * co, nz * sign))

            button = 2 if press and ref == 'K4' else press
            self.add_face([world(p, n) for p,n in nodes], triangles, color, polish, pressed=button)

    def save(self, path):
        count = len(self.unique)
        index_type = 'H' if count <= 65535 else 'I'
        indices = struct.pack(f'<{len(self.indices)}{index_type}', *self.indices)
        geometry = struct.pack('<4I', 0x31424350, count, len(self.indices), len(self.shadows) // 6)
        geometry += self.vertices + indices
        geometry += bytes(-len(geometry) % 4) + struct.pack(f'<{len(self.shadows)}f', *self.shadows)
        path.write_bytes(geometry)
        print(f'{count:,} vertices, {len(self.indices)//3:,} triangles, {len(geometry):,} bytes')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('step_directory', type=Path)
    args = parser.parse_args()
    sources = json.loads((MODELS / 'sources.json').read_text())
    placements = json.loads((MODELS / 'placements.json').read_text())
    imported = 0

    @cache
    def package(kind):
        if kind not in sources:
            return custom(kind)
        path = args.step_directory / f'{kind}.step'
        if hashlib.sha256(path.read_bytes()).hexdigest() != sources[kind]['sha256']:
            raise ValueError(f'Model digest mismatch for {kind}')
        return load_step(kind, path)

    mesh = Mesh()
    mesh.board()
    for side, components in placements.items():
        for ref, (kind, x, y, angle) in components.items():
            mesh.place(ref, side, x, y, angle, package(kind))
            imported += kind in sources
    mesh.save(ROOT / 'assets/simulator/astra-core-mesh.bin')
    print(f'{imported} placed components reuse STEP geometry from {len(sources)} KiCad packages.')


if __name__ == '__main__':
    main()
