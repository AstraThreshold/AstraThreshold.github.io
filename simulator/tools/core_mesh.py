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
from OCP.BRepOffsetAPI import BRepOffsetAPI_ThruSections
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
OLED_POLARIZER, LED_RESIN, LED_DIE = 3, 7, 11
EMITTERS = {'D6': 4, 'D1': 5, 'D5': 6}
# Length, width, height, carrier thickness, optical width, termination length.
CHIP_LEDS = {
    'led0402': (1.00, .50, .40, .18, .80, .20),
    'led0603': (1.60, .80, .60, .28, 1.00, .41),
    'led0805': (2.00, 1.20, .80, .28, 1.20, .45),
}


def box(x, y, width, height, z, thickness):
    return BRepPrimAPI_MakeBox(gp_Pnt(x - width / 2, y - height / 2, z), width, height, thickness).Shape()


def disk(x, y, z, diameter, height):
    return BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x, y, z), gp_Dir(0, 0, 1)), diameter / 2, height).Shape()


def outline(width, height, z, bevel, x=0, y=0):
    w, h = width / 2, height / 2
    polygon = BRepBuilderAPI_MakePolygon()
    for px, py in [(-w+bevel,-h),(w-bevel,-h),(w,-h+bevel),(w,h-bevel),
                   (w-bevel,h),(-w+bevel,h),(-w,h-bevel),(-w,-h+bevel)]:
        polygon.Add(gp_Pnt(x + px, y + py, z))
    polygon.Close()
    return polygon.Wire()


def chamfered(width, height, z, thickness, bevel, *, x=0, y=0):
    face = BRepBuilderAPI_MakeFace(outline(width, height, z, bevel, x, y)).Face()
    return BRepPrimAPI_MakePrism(face, gp_Vec(0, 0, thickness)).Shape()


def resin_lens(width, height, base, top):
    # A shallow mold draft and a small edge radius around the flat optical face.
    bevel = min(width, height) * .055
    loft = BRepOffsetAPI_ThruSections(True, True)
    loft.AddWire(outline(width, height, base, bevel))
    loft.AddWire(outline(width * .95, height * .96, top - bevel, bevel))
    loft.AddWire(outline(width * .87, height * .89, top, bevel))
    loft.Build()
    return loft.Shape()


def bond_wire(points):
    for start, end in zip(points, points[1:]):
        direction = tuple(b - a for a, b in zip(start, end))
        axis = gp_Ax2(gp_Pnt(*start), gp_Dir(*direction))
        yield BRepPrimAPI_MakeCylinder(axis, .014, math.hypot(*direction)).Shape()


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
        'sh4': (6, 5.15, 2.9), 'ind': (3, 3, 1.1),
    }.get(kind, extent)
    scales = [a/b for a,b in zip(target,extent)]
    mesh = []
    for nodes, tris, (rgb, polish) in geometry:
        # Adapt the SOIC body to the wide Winbond package and keep the 1.27 mm lead pitch.
        face_scale = (scales[0], 1, scales[2]) if kind == 'soic' and polish == 180 else scales
        mesh.append((list(normalize(nodes, turn, center, face_scale)), tris, rgb, polish, 0, 0))
    return mesh, target[:2]


def custom(kind):
    pieces = []

    def put(shape, rgb, polish=38, plunger=0, *, surface=0):
        pieces.append((shape, rgb, polish, plunger, surface))

    if kind == 'oled':
        # The 15.8 mm solder tail folds beneath the COG glass and terminates on U3.
        put(chamfered(15.80, 11.65, .045, .10, .34, x=-10.07, y=.033), (97, 58, 28), 86)
        put(chamfered(35.8, 17.1, .16, .51, .13), (12, 16, 15), 58)
        put(chamfered(35.76, 17.06, .67, .51, .13), (8, 11, 11), 47)
        # The driver masking at the left and the offset polarizer meet the cover glass.
        put(chamfered(3.12, 16.61, 1.18, .038, .12, x=-16.22), (5, 6, 6), 24, surface=OLED_POLARIZER)
        put(chamfered(32.25, 16.60, 1.18, .04, .12, x=1.53), (3, 4, 5), 24, surface=OLED_POLARIZER)
        for y in (-4.25, 3.75):
            put(chamfered(.25, .90, .10, .58, .08, x=-17.91, y=y), (121, 78, 41), 94)
        for pin in range(16):
            put(box(-2.14, .033 + (pin - 7.5) * .70, 3.18, .36, .014, .05), GOLD, 186)
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
        # X0812WVS plug: two exposed mating rails on a 6.70 x 4.00 mm base.
        put(chamfered(4.0, 6.70, .06, .42, .19), (40, 36, 34), 45)
        for side in (-1, 1):
            put(chamfered(.66, 5.20, .48, 1.26, .12, x=side), (49, 42, 38), 51)
            put(chamfered(.72, 6.58, .48, .29, .14, x=side * 1.61), (34, 30, 28), 47)
            put(chamfered(2.4, .68, .48, .38, .14, y=side * 2.98), (36, 31, 29), 49)
        for index in range(6):
            y = (index - 2.5) * .8
            for side in (-1, 1):
                put(box(side * 2.03, y, 1.14, .25, .035, .13), TIN, 200)
                put(box(side * 1.91, y, .26, .25, .15, .28), TIN, 190)
                put(box(side * 1.34, y, .10, .25, .64, 1.14), GOLD, 204)
                put(chamfered(.56, .26, 1.73, .17, .045, x=side * 1.07, y=y), (202, 156, 86), 190)
        size = (4, 6.70)
    elif kind == 'side':
        # KHON TSE05410: a lateral stem, stamped steel cover, and amber seal.
        put(chamfered(4.7, 3.6, .04, 1.45, .17), (51, 47, 41), 44)
        cover = chamfered(4.70, 3.60, 1.49, .16, .16)
        cover = BRepAlgoAPI_Cut(cover, chamfered(2.82, 2.40, 1.48, .22, .15)).Shape()
        put(cover, (155, 151, 134), 183)
        put(chamfered(2.81, 2.39, 1.44, .115, .14), (171, 135, 37), 114)
        put(box(0, -.09, .76, .32, 1.55, .008), (120, 93, 29), 82)
        for side in (-1, 1):
            put(box(side * .51, -.09, .21, 1.13, 1.55, .009), (140, 107, 28), 82)
            for y in (-.8125, .8125):
                put(box(side * 2.37, y, .88, .57, .035, .16), TIN, 189)
                put(box(side * 2.30, y, .18, .56, .18, .79), (152, 148, 135), 144)
            put(box(side * 2.27, 0, .16, .74, .62, .95), (151, 147, 133), 171)
        put(box(0, -1.97, 2.14, .64, .37, 1.01), (55, 47, 38), 49)
        put(chamfered(2.60, .46, .16, 1.40, .07, y=-2.48), (66, 56, 43), 55)
        for x in (-.63, .63):
            put(box(x, -2.03, .23, .65, 1.32, .20), (73, 61, 47), 55)
        size = (4.70, 3.60)
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
    elif kind in CHIP_LEDS:
        length, width, height, carrier, window, terminal = CHIP_LEDS[kind]
        board = chamfered(length, width, .015, carrier - .015, .034)
        for sign in (-1, 1):
            side = sign * length / 2
            center = sign * (length - terminal) / 2
            lead = box(center, 0, terminal, width, .013, carrier - .009)
            board = BRepAlgoAPI_Cut(board, box(center, 0, terminal, width+.04, 0, carrier+.04)).Shape()
            if kind != 'led0402':
                # Exposed semicircular castellations in the carrier and lead plating.
                lead = clip_hole(lead, side, 0, 0, width * .34, carrier + .04)
            put(lead, TIN, 198)
        put(board, (206, 202, 171), 54)
        cathode = (.46 if kind == 'led0402' else -.39) * length
        put(box(cathode, width * .34, length * .11, width * .23, carrier + .006, .012),
            (74, 113, 63), 52)
        put(box(-window * .22, 0, window * .34, width * .64, carrier + .008, .022), GOLD, 188)
        put(box(window * .22, 0, window * .34, width * .64, carrier + .008, .022), (177, 151, 105), 170)
        put(chamfered(window * .24, width * .26, carrier + .028, .045, .026, x=window * .13),
            (118, 119, 78), 153, surface=LED_DIE)
        for segment in bond_wire(((window * .13, 0, carrier + .08),
                                  (-window * .04, 0, carrier + .13),
                                  (-window * .23, 0, carrier + .03))):
            put(segment, GOLD, 182)
        put(resin_lens(window, width, carrier, height), (206, 220, 209), 164, surface=LED_RESIN)
        size = (length, width)
    elif kind == 'ws2812':
        board = chamfered(2.20, 2.00, .02, .26, .065)
        for x in (-1.10, 1.10):
            for y in (-.55, .55):
                board = clip_hole(board, x, y, 0, .35, .30)
                lead = box(x * .80, y, .53, .70, .015, .27)
                put(clip_hole(lead, x, y, 0, .35, .30), TIN, 189)
        put(board, (221, 213, 190), 48)
        put(chamfered(.57, .42, .30, .09, .035, y=-.36), (83, 78, 60), 112)
        for x, tint in [(-.34, (92, 121, 76)), (0, (165, 122, 74)), (.34, (100, 112, 128))]:
            put(box(x, .22, .22, .28, .285, .04), GOLD, 153)
            put(box(x, .22, .15, .15, .325, .06), tint, 111)
        put(resin_lens(1.48, 1.84, .28, .84), (226, 225, 207), 124, surface=LED_RESIN)
        size = (2.20, 2.00)
    elif kind == 'ind':
        put(chamfered(3.0, 3.0, .06, 1.02, .40), (89, 86, 82), 56)
        put(chamfered(2.65, 2.65, 1.08, .08, .61), (105, 102, 99), 66)
        for x in (-1.19, 1.19):
            put(box(x, 0, 1.14, 2.75, .025, .13), TIN, 168)
        size = (3, 3)
    else:
        raise ValueError(f'Missing model for {kind}')
    return ([(nodes, tris, rgb, polish, press, surface) for shape, rgb, polish, press, surface in pieces
             for _, nodes, tris in faces_of(shape)], size)


class Mesh:
    def __init__(self):
        self.vertices = bytearray()
        self.indices = []
        self.clear_indices = []
        self.palette = {}
        self.unique = {}
        self.shadows = []

    def add_face(self, nodes, triangles, rgb, polish, surface=0, pressed=0):
        material = (*rgb, surface, polish, pressed)
        color_index = self.palette.setdefault(material, len(self.palette))
        mapped = []
        for p, n in nodes:
            length = math.sqrt(sum(v*v for v in n)) or 1
            pos = [round(v * 100) for v in p]
            norm = [round(v * 127 / length) for v in n]
            key = struct.pack('<3h3bB', *pos, *norm, color_index)
            index = self.unique.get(key)
            if index is None:
                index = len(self.unique)
                self.unique[key] = index
                self.vertices.extend(key)
            mapped.append(index)
        indices = self.clear_indices if 4 <= surface <= LED_RESIN else self.indices
        indices.extend(mapped[i] for t in triangles for i in t)

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
        for nodes, triangles, color, polish, press, surface in geometry:
            def world(point, normal):
                px, py, pz = point
                nx, ny, nz = normal
                return (((x + px * co - py * si - WIDTH / 2) * sign,
                         y + px * si + py * co - HEIGHT / 2, surface_z + pz * sign),
                        ((nx * co - ny * si) * sign, nx * si + ny * co, nz * sign))

            button = 2 if press and ref == 'K4' else press
            emitter = EMITTERS.get(ref, 0)
            if surface == LED_RESIN and emitter:
                surface = emitter
            elif surface == LED_DIE:
                surface = emitter + 4 if emitter else 0
            self.add_face([world(p, n) for p,n in nodes], triangles, color, polish,
                          surface=surface, pressed=button)

    def solder_joint(self, side, x, y, width, height, lead_direction):
        # A low wetting fillet tapers into the termination while staying inside the paste aperture.
        sign = 1 if side == 'front' else -1
        surface_z = -GLASS if sign == 1 else -GLASS - THICKNESS
        along_x = abs(lead_direction) == 1
        toward = 1 if lead_direction > 0 else -1
        dx = toward * width if along_x else 0
        dy = toward * height if not along_x else 0
        rise = min(.24, max(.085, min(width, height) * .27))
        profile = [(-.32, -.49), (.32, -.49), (.49, -.32), (.49, .32),
                   (.32, .49), (-.32, .49), (-.49, .32), (-.49, -.32)]
        nodes = []
        for scale, shift, z, edge in [(1, 0, .01, .72), (.94, .028, .027, 1.10), (.56, .15, rise, .32)]:
            for px, py in profile:
                point = ((x + px * width * scale + dx * shift - WIDTH / 2) * sign,
                         y + py * height * scale + dy * shift - HEIGHT / 2, surface_z + z * sign)
                nodes.append((point, (px * edge * sign, py * edge, .42 * sign)))
        triangles = []
        for start in (0, 8):
            for i in range(8):
                a, b = start + i, start + (i + 1) % 8
                triangles.extend(((a, b, a + 8), (b, b + 8, a + 8)))
        triangles.extend((16, i, i + 1) for i in range(17, 23))
        self.add_face(nodes, triangles, (161, 163, 153), 198)

    def save(self, path):
        count = len(self.unique)
        index_type = 'H' if count <= 65535 else 'I'
        ordered = self.indices + self.clear_indices
        indices = struct.pack(f'<{len(ordered)}{index_type}', *ordered)
        palette = bytes(channel for material in self.palette for channel in material)
        geometry = struct.pack('<6I', 0x33424350, count, len(ordered), len(self.shadows) // 6,
                               len(self.palette), len(self.indices))
        geometry += self.vertices + indices + palette
        geometry += bytes(-len(geometry) % 4) + struct.pack(f'<{len(self.shadows)}f', *self.shadows)
        path.write_bytes(geometry)
        print(f'{count:,} vertices, {len(ordered)//3:,} triangles, {len(geometry):,} bytes')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('step_directory', type=Path)
    args = parser.parse_args()
    sources = json.loads((MODELS / 'sources.json').read_text())
    placements = json.loads((MODELS / 'placements.json').read_text())
    joints = json.loads((MODELS / 'solder.json').read_text())
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
        for pad in joints[side]:
            mesh.solder_joint(side, *pad)
    mesh.save(ROOT / 'assets/simulator/astra-core-mesh.bin')
    print(f'{imported} placed components reuse STEP geometry from {len(sources)} KiCad packages.')


if __name__ == '__main__':
    main()
