#!/usr/bin/env python3
"""Local RDKit / PySCF worker. One JSON request, one __RESULT__ JSON response.

Coordinates entering through the drawing are pixels. Quantum-chemical coordinates
are generated independently in angstrom and include hydrogens. No network calls.
"""
from __future__ import annotations

import hashlib
import importlib
import json
import math
import os
import platform
import copy
import random
import sys
import time
from typing import Any

SUPPORTED_ELEMENTS = ("H", "B", "C", "N", "O", "F", "Si", "P", "S", "Cl", "Br", "I")
METHODS = ("B3LYP", "PBE", "PBE0", "HF")
BASES = ("sto-3g", "6-31g", "6-31g(d)", "6-31+g(d)", "def2-svp", "def2-tzvp")
HARTREE_EV = 27.211386245988
MAX_ATOMS = 2000
MAX_QUANTUM_ATOMS = 600
MAX_BASIS_FUNCTIONS = 1200


# Saturated repeat precursors; joining replaces endpoint hydrogens.
POLYMER_PRESETS = {
    "pe": ("PE", "ポリエチレン", "CC", 0, 1, "CH₂–CH₂", {"C":2,"H":4}),
    "pp": ("PP", "ポリプロピレン", "CC(C)", 0, 1, "CH₂–CH(CH₃)", {"C":3,"H":6}),
    "ps": ("PS", "ポリスチレン", "CC(c1ccccc1)", 0, 1, "CH₂–CH(C₆H₅)", {"C":8,"H":8}),
    "pmma": ("PMMA", "ポリメタクリル酸メチル", "CC(C)(C(=O)OC)", 0, 1, "CH₂–C(CH₃)(COOCH₃)", {"C":5,"H":8,"O":2}),
    "peg": ("PEG", "ポリエチレングリコール", "OCC", 0, 2, "CH₂–CH₂–O", {"C":2,"H":4,"O":1}),
    "pvc": ("PVC", "ポリ塩化ビニル", "CC(Cl)", 0, 1, "CH₂–CH(Cl)", {"C":2,"H":3,"Cl":1}),
    "pan": ("PAN", "ポリアクリロニトリル", "CC(C#N)", 0, 1, "CH₂–CH(CN)", {"C":3,"H":3,"N":1}),
    "pva": ("PVA", "ポリビニルアルコール", "CC(O)", 0, 1, "CH₂–CH(OH)", {"C":2,"H":4,"O":1}),
    "ptfe": ("PTFE", "ポリテトラフルオロエチレン", "C(F)(F)C(F)F", 0, 3, "CF₂–CF₂", {"C":2,"F":4}),
}
STEREO_NOTE = "立体規則性は未指定です。生成する1配座をアイソタクチック・シンジオタクチック・アタクチックの代表とはみなせません。"


def polymer_catalog():
    return [{"id": key, "name": v[0], "label": v[1], "repeat": v[5], "composition": v[6],
             "endComposition": {"H":2,"O":1} if key == "peg" else {"H":2},
             "prefix": "HO" if key == "peg" else "H", "suffix": "H",
             "termination": "OH / OH" if key == "peg" else "H / H",
             "stereoNote": STEREO_NOTE if key in ("pp","ps","pmma","pvc","pan","pva") else
             "H終端のモデルです。工業製品の末端基とは異なる場合があります。" if key == "ptfe" else ""}
            for key, v in POLYMER_PRESETS.items()]


class ChemistryError(ValueError):
    """Actionable error safe to display in the desktop application."""


def log(message: str) -> None:
    print(message, flush=True)


def integer(value: Any, name: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ChemistryError(f"{name}は整数で指定してください。")
    if not math.isfinite(value) or value != int(value) or not minimum <= value <= maximum:
        raise ChemistryError(f"{name}は{minimum}〜{maximum}の整数で指定してください。")
    return int(value)


def status() -> dict:
    versions = {"python": platform.python_version()}
    missing = []
    for name in ("rdkit", "pyscf", "geometric"):
        try:
            module = importlib.import_module(name)
            versions[name] = str(getattr(module, "__version__", "installed"))
        except (ImportError, OSError) as exc:
            missing.append(name)
            log(f"Dependency {name}: {exc}")
    return {"ready": not missing, "versions": versions, "missing": missing,
            "supportedElements": list(SUPPORTED_ELEMENTS), "methods": list(METHODS),
            "bases": list(BASES), "maxQuantumAtoms": MAX_QUANTUM_ATOMS,
            "maxBasisFunctions": MAX_BASIS_FUNCTIONS, "polymerPresets": polymer_catalog()}


def graph_signature(graph: dict) -> str:
    """A coordinate-independent signature to guard preserved import metadata."""
    atoms = sorted((a["id"], a["element"], a.get("charge", 0)) for a in graph["atoms"])
    bonds = sorted((min(b["a"], b["b"]), max(b["a"], b["b"]), b["order"])
                   for b in graph["bonds"])
    signature = [atoms, bonds]
    stereo = sorted((b["a"], b["b"], b["stereo"]) for b in graph["bonds"] if b.get("stereo"))
    if stereo:
        signature.append(stereo)
    return hashlib.sha256(json.dumps(signature, separators=(",", ":")).encode()).hexdigest()


def validate_mol(mol):
    from rdkit import Chem
    if mol is None or not mol.GetNumAtoms():
        raise ChemistryError("構造を読み取れません。原子・結合またはSMILESを確認してください。")
    if mol.GetNumAtoms() > MAX_ATOMS:
        raise ChemistryError(f"この版は水素を含めて{MAX_ATOMS}原子まで対応しています。")
    unsupported = sorted({a.GetSymbol() for a in mol.GetAtoms()} - set(SUPPORTED_ELEMENTS))
    if unsupported:
        raise ChemistryError("未対応の元素です: " + ", ".join(unsupported))
    if len(Chem.GetMolFrags(mol)) != 1:
        raise ChemistryError("離れた複数の構造には対応していません。1つの分子を描いてください。")
    try:
        Chem.SanitizeMol(mol)
    except Exception as exc:
        raise ChemistryError("原子価または結合に矛盾があります。元素、結合次数、形式電荷を確認してください。") from exc
    return mol


def molecule_from_graph(graph: dict):
    from rdkit import Chem
    if not isinstance(graph, dict) or not isinstance(graph.get("atoms"), list) or not isinstance(graph.get("bonds"), list):
        raise ChemistryError("分子データの形式が正しくありません。")
    if not 0 < len(graph["atoms"]) <= MAX_ATOMS:
        raise ChemistryError(f"原子を1〜{MAX_ATOMS}個描いてください。")
    if len(graph["bonds"]) > MAX_ATOMS * 4:
        raise ChemistryError("結合が多すぎます。")
    rw = Chem.RWMol()
    atom_indices = {}
    for item in graph["atoms"]:
        if not isinstance(item, dict):
            raise ChemistryError("原子データの形式が正しくありません。")
        atom_id = item.get("id")
        if not isinstance(atom_id, str) or not atom_id or atom_id in atom_indices:
            raise ChemistryError("原子IDが空か重複しています。")
        element = item.get("element", "C")
        if element not in SUPPORTED_ELEMENTS:
            raise ChemistryError(f"未対応の元素です: {element}")
        for coord in ("x", "y"):
            value = item.get(coord, 0)
            if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value):
                raise ChemistryError("原子の座標が正しくありません。")
        atom = Chem.Atom(element)
        atom.SetFormalCharge(integer(item.get("charge", 0), "形式電荷", -4, 4))
        atom_indices[atom_id] = rw.AddAtom(atom)
    pairs = set()
    for item in graph["bonds"]:
        if not isinstance(item, dict) or item.get("a") not in atom_indices or item.get("b") not in atom_indices:
            raise ChemistryError("結合先の原子がありません。")
        a, b = atom_indices[item["a"]], atom_indices[item["b"]]
        key = tuple(sorted((a, b)))
        if a == b or key in pairs:
            raise ChemistryError("自分自身への結合、または重複した結合があります。")
        pairs.add(key)
        order = integer(item.get("order", 1), "結合次数", 1, 3)
        rw.AddBond(a, b, {1: Chem.BondType.SINGLE, 2: Chem.BondType.DOUBLE, 3: Chem.BondType.TRIPLE}[order])
        stereo = item.get("stereo", "")
        if stereo not in ("", None, "up", "down") or (stereo and order != 1):
            raise ChemistryError("くさび・破線は単結合に指定してください。")
        if stereo:
            rw.GetBondBetweenAtoms(a, b).SetBondDir(Chem.BondDir.BEGINWEDGE if stereo == "up" else Chem.BondDir.BEGINDASH)

    if graph.get("molblock"):
        if graph.get("sourceGraph") != graph_signature(graph):
            raise ChemistryError("編集前の構造情報が残っています。構造を再読み込みしてください。")
        # Parse without removing explicit H: atom indices must stay identical.
        imported = Chem.MolFromMolBlock(graph["molblock"], removeHs=False, strictParsing=True)
        validate_mol(imported)
        expected = Chem.Mol(imported)
        Chem.Kekulize(expected, clearAromaticFlags=True)
        # Recheck metadata contents, not just its claimed signature.
        if expected.GetNumAtoms() != len(graph["atoms"]) or expected.GetNumBonds() != len(graph["bonds"]):
            raise ChemistryError("保存された構造情報と描画が一致していません。")
        for i, item in enumerate(graph["atoms"]):
            atom = expected.GetAtomWithIdx(i)
            if atom.GetSymbol() != item["element"] or atom.GetFormalCharge() != item.get("charge", 0):
                raise ChemistryError("保存された原子情報と描画が一致していません。")
        expected_bonds = {(min(b.GetBeginAtomIdx(), b.GetEndAtomIdx()), max(b.GetBeginAtomIdx(), b.GetEndAtomIdx()), int(b.GetBondTypeAsDouble()))
                          for b in expected.GetBonds()}
        actual_bonds = {(min(atom_indices[b["a"]], atom_indices[b["b"]]), max(atom_indices[b["a"]], atom_indices[b["b"]]), b["order"])
                        for b in graph["bonds"]}
        if expected_bonds != actual_bonds:
            raise ChemistryError("保存された結合情報と描画が一致していません。")
        return imported
    mol = validate_mol(rw.GetMol())
    if any(b.get("stereo") for b in graph["bonds"]):
        conf = Chem.Conformer(mol.GetNumAtoms())
        conf.Set3D(False)
        for i, atom in enumerate(graph["atoms"]):
            conf.SetAtomPosition(i, (float(atom.get("x", 0)) / 56, -float(atom.get("y", 0)) / 56, 0.0))
        mol.AddConformer(conf)
        Chem.AssignChiralTypesFromBondDirs(mol, replaceExistingTags=True)
        Chem.AssignStereochemistry(mol, cleanIt=True, force=True)
    return mol


def graph_from_molecule(mol) -> dict:
    from rdkit import Chem
    from rdkit.Chem import rdDepictor
    drawing = Chem.Mol(mol)
    Chem.Kekulize(drawing, clearAromaticFlags=True)
    rdDepictor.Compute2DCoords(drawing)
    Chem.AssignStereochemistry(drawing, cleanIt=True, force=True)
    Chem.WedgeMolBonds(drawing, drawing.GetConformer())
    conformer = drawing.GetConformer()
    coords = [(conformer.GetAtomPosition(i).x, conformer.GetAtomPosition(i).y) for i in range(drawing.GetNumAtoms())]
    lengths = [math.dist(coords[b.GetBeginAtomIdx()], coords[b.GetEndAtomIdx()]) for b in drawing.GetBonds()]
    scale = 56 / (sum(lengths) / len(lengths)) if lengths else 56
    cx = sum(p[0] for p in coords) / len(coords)
    cy = sum(p[1] for p in coords) / len(coords)
    atoms = [{"id": f"a{i}", "element": a.GetSymbol(), "charge": a.GetFormalCharge(),
              "x": round((coords[i][0] - cx) * scale, 4), "y": round(-(coords[i][1] - cy) * scale, 4)}
             for i, a in enumerate(drawing.GetAtoms())]
    bonds = [{"id": f"b{i}", "a": f"a{b.GetBeginAtomIdx()}", "b": f"a{b.GetEndAtomIdx()}",
              "order": int(b.GetBondTypeAsDouble())} for i, b in enumerate(drawing.GetBonds())]
    for i, atom in enumerate(drawing.GetAtoms()):
        if atom.HasProp("_CIPCode"):
            atoms[i]["cip"] = atom.GetProp("_CIPCode")
    for i, bond in enumerate(drawing.GetBonds()):
        if bond.GetBondDir() in (Chem.BondDir.BEGINWEDGE, Chem.BondDir.BEGINDASH):
            bonds[i]["stereo"] = "up" if bond.GetBondDir() == Chem.BondDir.BEGINWEDGE else "down"
    graph = {"atoms": atoms, "bonds": bonds, "molblock": Chem.MolToMolBlock(drawing, includeStereo=True)}
    graph["sourceGraph"] = graph_signature(graph)
    return graph


def clean_2d(payload):
    """Regenerate readable 2D coordinates without losing the molecular identity."""
    from rdkit import Chem
    from rdkit.Chem import rdMolDescriptors
    original = payload.get("molecule")
    mol = molecule_from_graph(original)
    metadata = polymer_metadata(original)
    graph = graph_from_molecule(mol)
    ids = {a["id"]: original["atoms"][i]["id"] for i, a in enumerate(graph["atoms"])}
    for atom in graph["atoms"]:
        atom["id"] = ids[atom["id"]]
    old_bonds = {frozenset((b["a"], b["b"])): b["id"] for b in original["bonds"]}
    for bond in graph["bonds"]:
        bond["a"], bond["b"] = ids[bond["a"]], ids[bond["b"]]
        bond["id"] = old_bonds[frozenset((bond["a"], bond["b"]))]
    graph["sourceGraph"] = graph_signature(graph)
    if metadata:
        graph["polymer"] = copy.deepcopy(metadata)
        graph["polymerGraph"] = graph_signature(graph)
    return {"molecule": graph, "smiles": Chem.MolToSmiles(mol, isomericSmiles=True),
            "formula": rdMolDescriptors.CalcMolFormula(mol),
            "stereo": [{"atom_id": a["id"], "cip": a["cip"]} for a in graph["atoms"] if a.get("cip")], "warnings": []}


def xyz_string(atoms: list[dict], title: str) -> str:
    lines = [str(len(atoms)), title.replace("\n", " ")]
    lines.extend(f"{a['element']:<2} {a['x']: .10f} {a['y']: .10f} {a['z']: .10f}" for a in atoms)
    return "\n".join(lines) + "\n"


def polymer_metadata(graph):
    metadata = graph.get("polymer") if isinstance(graph, dict) else None
    if metadata and graph.get("polymerGraph") != graph_signature(graph):
        raise ChemistryError("高分子の繰り返し情報と描画が一致しません。鎖を作り直してください。")
    return metadata


def build_polymer(payload: dict) -> dict:
    """Build explicit finite head-to-tail chains, retaining the exact sequence.

    Vinyl tacticity uses the ordered predecessor/forward/side-group neighbor
    frame. It never equates a run of CIP labels with a tacticity assignment.
    """
    from rdkit import Chem
    from rdkit.Chem import Descriptors, rdMolDescriptors
    degree_a = integer(payload.get("degree", 5), "重合度n", 1, 100)
    architecture = payload.get("architecture", "homopolymer")
    if architecture not in ("homopolymer", "block", "random"):
        raise ChemistryError("鎖の配列には単一・ブロック・ランダムを指定してください。")
    source = payload.get("source", "pe")
    source_b = payload.get("sourceB", "pp")
    degree_b = integer(payload.get("degreeB", 5), "B単位数", 1, 99) if architecture != "homopolymer" else 0
    degree = degree_a + degree_b
    if degree > 100:
        raise ChemistryError("AとBを合わせた繰り返し数は100以下にしてください。")
    seed = integer(payload.get("seed", 42), "乱数シード", 0, 2147483646)
    tacticity = payload.get("tacticity", "unspecified")
    if tacticity not in ("unspecified", "isotactic", "syndiotactic", "random"):
        raise ChemistryError("立体規則性の指定が正しくありません。")
    vinyl = set(POLYMER_PRESETS) - {"peg"}
    if architecture != "homopolymer" and (source not in vinyl or source_b not in vinyl):
        raise ChemistryError("共重合体は炭素主鎖のプリセット同士に対応しています。PEG・手描き単位は単独で生成してください。")
    if tacticity != "unspecified" and (source not in vinyl or (architecture != "homopolymer" and source_b not in vinyl)):
        raise ChemistryError("この繰り返し単位の立体規則性は指定できません。未指定を選んでください。")
    if architecture != "homopolymer" and tacticity in ("isotactic", "syndiotactic") and source != source_b:
        raise ChemistryError("異なる繰り返し単位の共重合体にはアイソ／シンジオの一括指定はできません。未指定またはシード付き配置を選んでください。")
    presets = {p["id"]: p for p in polymer_catalog()}
    def precursor(key):
        if key in POLYMER_PRESETS:
            name, _, smiles, head, tail, _, _ = POLYMER_PRESETS[key]
            return Chem.MolFromSmiles(smiles), head, tail, name
        if key != "drawing":
            raise ChemistryError("繰り返し単位の指定が正しくありません。")
        graph = payload.get("molecule")
        unit = molecule_from_graph(graph)
        for i, atom in enumerate(unit.GetAtoms()):
            atom.SetProp("_polyID", graph["atoms"][i]["id"])
        unit = Chem.RemoveHs(unit)
        ids = {a.GetProp("_polyID"): a.GetIdx() for a in unit.GetAtoms() if a.HasProp("_polyID")}
        if payload.get("head") not in ids or payload.get("tail") not in ids:
            raise ChemistryError("接続点A・Bには水素以外の原子を選んでください。")
        return unit, ids[payload["head"]], ids[payload["tail"]], "カスタム鎖"
    unit, head, tail, name = precursor(source)
    entries = {source: (unit, head, tail, name)}
    sequence = [source] * degree_a
    if degree_b:
        entries[source_b] = precursor(source_b)
        sequence += [source_b] * degree_b
        if architecture == "random":
            random.Random(seed).shuffle(sequence)
        name = f"{name}-{'b' if architecture == 'block' else 'ran'}-{entries[source_b][3]}"
    default_ends = {"head": "OH", "tail": "OH"} if source == "peg" else {"head": "H", "tail": "H"}
    ends = payload.get("endGroups", default_ends)
    if not isinstance(ends, dict) or any(not (ends.get(end) in ("H", "OH", "CH3", "NH2", "OCOCH3") if isinstance(ends.get(end), str) else isinstance(ends.get(end), dict)) for end in ("head", "tail")):
        raise ChemistryError("末端基にはH、OH、CH3、NH2、OCOCH3または保存した原子団を指定してください。")
    caps = {}
    for side in ("head", "tail"):
        entry = ends[side]
        if entry == "OCOCH3":
            caps[side] = (Chem.MolFromSmiles("OC(=O)C"), 0)
        if isinstance(entry, dict):
            cap_graph = entry.get("molecule")
            cap = molecule_from_graph(cap_graph)
            ids = [a["id"] for a in cap_graph["atoms"]]
            if entry.get("root") not in ids or cap.GetNumAtoms() > 100 or len(Chem.GetMolFrags(cap)) != 1:
                raise ChemistryError("末端原子団は100原子以内の連結した構造と、有効な接続点を指定してください。")
            root = ids.index(entry["root"])
            atom = cap.GetAtomWithIdx(root)
            if atom.GetSymbol() == "H" or atom.GetTotalNumHs() < 1 or atom.GetNumRadicalElectrons() or atom.GetChiralTag() != Chem.ChiralType.CHI_UNSPECIFIED:
                raise ChemistryError("末端原子団の接続点には置換できる水素が必要です。接続点の立体配置は未指定にしてください。")
            caps[side] = (cap, root)
    
    if source == "peg" and ends != default_ends:
        raise ChemistryError("PEGはこの版ではOH / OHのジオール末端を使用してください。")
    for this_unit, this_head, this_tail, _ in entries.values():
        validate_mol(this_unit)
        for idx in {this_head, this_tail}:
            atom = this_unit.GetAtomWithIdx(idx)
            if atom.GetChiralTag() != Chem.ChiralType.CHI_UNSPECIFIED:
                raise ChemistryError("立体配置を指定した原子を接続点にはできません。接続点の立体配置を解除するか、別の原子を選んでください。")
            required = 2 if this_head == this_tail and degree > 2 else 1 if degree > 1 else 0
            if atom.GetTotalNumHs() < required or atom.GetNumRadicalElectrons():
                raise ChemistryError("接続点には、結合で置換できる水素が必要です。末端の飽和炭素などを選んでください。")
    if sum(entries[key][0].GetNumAtoms() for key in sequence) + 2 > MAX_ATOMS:
        raise ChemistryError("鎖が大きすぎます。重合度を小さくしてください。")
    chain = None
    offsets = []
    count = 0
    for key in sequence:
        current = entries[key][0]
        offsets.append(count)
        count += current.GetNumAtoms()
        chain = Chem.Mol(current) if chain is None else Chem.CombineMols(chain, current)
    rw = Chem.RWMol(chain)
    consumed = {}
    def join(a, b):
        rw.AddBond(a, b, Chem.BondType.SINGLE)
        for idx in (a, b):
            consumed[idx] = consumed.get(idx, 0) + 1
    for i in range(degree - 1):
        join(offsets[i] + entries[sequence[i]][2], offsets[i + 1] + entries[sequence[i + 1]][1])
    endpoints = [offsets[0] + entries[sequence[0]][1], offsets[-1] + entries[sequence[-1]][2]]
    for side, endpoint in zip(("head", "tail"), endpoints):
        cap_type = ends[side]
        if source == "peg" and side == "head":
            continue  # The OCC precursor already includes the first hydroxyl.
        if side in caps:
            cap, root = caps[side]
            cap = Chem.Mol(cap)
            atom = cap.GetAtomWithIdx(root)
            if atom.GetNumExplicitHs():
                atom.SetNumExplicitHs(atom.GetNumExplicitHs() - 1)
            new_index = rw.GetNumAtoms() + root
            rw = Chem.RWMol(Chem.CombineMols(rw.GetMol(), cap))
            rw.AddBond(endpoint, new_index, Chem.BondType.SINGLE)
            consumed[endpoint] = consumed.get(endpoint, 0) + 1
        elif cap_type != "H":
            new_index = rw.AddAtom(Chem.Atom("O" if cap_type == "OH" else "N" if cap_type == "NH2" else "C"))
            # A newly appended cap has no precursor H count to consume.
            rw.AddBond(endpoint, new_index, Chem.BondType.SINGLE)
            consumed[endpoint] = consumed.get(endpoint, 0) + 1
    for idx, consumption in consumed.items():
        atom = rw.GetAtomWithIdx(idx)
        if chain.GetAtomWithIdx(idx).GetTotalNumHs() < consumption:
            raise ChemistryError("接続点の水素が不足しています。末端基または接続点を変更してください。")
        if atom.GetNumExplicitHs():
            atom.SetNumExplicitHs(max(0, atom.GetNumExplicitHs() - consumption))
    if rw.GetNumAtoms() > MAX_ATOMS:
        raise ChemistryError("末端を含む鎖が大きすぎます。")
    mol = validate_mol(rw.GetMol())
    configurations = []
    rng = random.Random(seed)
    if tacticity != "unspecified":
        for i, key in enumerate(sequence):
            if key not in ("pp", "ps", "pmma", "pvc", "pan", "pva"):
                continue
            idx = offsets[i] + entries[key][2]
            atom = mol.GetAtomWithIdx(idx)
            # Original neighbor order: own CH2, side group(s), next CH2.
            # The same local order holds in every repeat; identical tags thus
            # represent identical configurational base units along the chain.
            sign = (i % 2) if tacticity == "syndiotactic" else rng.randrange(2) if tacticity == "random" else 0
            atom.SetChiralTag(Chem.ChiralType.CHI_TETRAHEDRAL_CW if sign == 0 else Chem.ChiralType.CHI_TETRAHEDRAL_CCW)
            configurations.append({"unit": i + 1, "atom_index": idx, "orientation": sign})
        Chem.AssignStereochemistry(mol, cleanIt=True, force=True)
        configurations = [dict(c, cip=mol.GetAtomWithIdx(c["atom_index"]).GetProp("_CIPCode") if mol.GetAtomWithIdx(c["atom_index"]).HasProp("_CIPCode") else None)
                          for c in configurations if mol.GetAtomWithIdx(c["atom_index"]).GetChiralTag() != Chem.ChiralType.CHI_UNSPECIFIED]
    full = Chem.AddHs(mol)
    validate_mol(full)
    graph = graph_from_molecule(mol)
    termination = " / ".join(str(ends[side].get("name", "自作末端"))[:60] if isinstance(ends[side], dict) else ends[side] for side in ("head", "tail"))
    stereo_note = STEREO_NOTE if tacticity == "unspecified" and any(k in ("pp", "ps", "pmma", "pvc", "pan", "pva") for k in sequence) else ""
    if tacticity != "unspecified":
        stereo_note = "主鎖方向に沿った相対配置を指定しています。末端など非立体中心は除外し、R/Sの並びだけで立体規則性を判定しません。"
        if tacticity == "random":
            stereo_note += " シードで固定した1つの配置列であり、アタクチック材料の配置分布ではありません。"
        if not configurations:
            stereo_note += " この鎖には指定可能な立体中心がありません。"
    info = {"name": name, "preset": source, "sourceB": source_b if degree_b else None,
            "degree": degree, "degreeA": degree_a, "degreeB": degree_b, "architecture": architecture,
            "sequence": sequence, "seed": seed, "tacticity": tacticity, "configurations": configurations,
            "endGroups": dict(ends), "stereoNote": stereo_note, "termination": termination, "model": "finite_chain",
            "unit_smiles": Chem.MolToSmiles(unit, isomericSmiles=True), "head_index": head,
            "tail_index": tail, "unit": graph_from_molecule(unit), "total_atoms": full.GetNumAtoms(),
            "description": f"{termination}終端の有限鎖。無限鎖・バルク高分子の計算ではありません。"}
    graph["polymer"] = info
    graph["polymerGraph"] = graph_signature(graph)
    return {"molecule": graph, "polymer": info, "formula": rdMolDescriptors.CalcMolFormula(full),
            "smiles": Chem.MolToSmiles(mol, isomericSmiles=True), "mass": Descriptors.MolWt(full),
            "charge": Chem.GetFormalCharge(mol), "total_atoms": full.GetNumAtoms(),
            "quantum_allowed": full.GetNumAtoms() <= MAX_QUANTUM_ATOMS,
            "warnings": [note for note in [info["description"], info["stereoNote"], "生成する3D構造は1配座です。配座分布・結晶・融体の物性を表すものではありません。"] if note]}


def prepare_molecule(mol, graph: dict | None = None) -> dict:
    from rdkit import Chem
    from rdkit.Chem import AllChem, Descriptors, rdMolDescriptors
    validate_mol(mol)
    graph = graph if graph is not None else graph_from_molecule(mol)
    smiles = Chem.MolToSmiles(mol, isomericSmiles=True)
    full = Chem.AddHs(mol)
    validate_mol(full)
    if full.GetNumAtoms() > MAX_QUANTUM_ATOMS:
        raise ChemistryError(f"3D生成・量子化学計算は水素込み{MAX_QUANTUM_ATOMS}原子までです。重合度nを小さくしてください（現在{full.GetNumAtoms()}原子）。")
    params = AllChem.ETKDGv3()
    params.randomSeed = 42
    params.numThreads = 1
    warnings = []
    log("3D構造を生成しています（ETKDGv3、水素を補完）…")
    if AllChem.EmbedMolecule(full, params) != 0:
        params.useRandomCoords = True
        if AllChem.EmbedMolecule(full, params) != 0:
            raise ChemistryError("3D構造を生成できませんでした。結合や環構造を確認してください。")
    force_field = "none"
    if full.GetNumAtoms() > 1:
        if AllChem.MMFFHasAllMoleculeParams(full):
            force_field = "MMFF94"
            converged = AllChem.MMFFOptimizeMolecule(full, maxIters=500) == 0
        elif AllChem.UFFHasAllMoleculeParams(full):
            force_field = "UFF"
            converged = AllChem.UFFOptimizeMolecule(full, maxIters=500) == 0
        else:
            converged = False
            warnings.append("力場のパラメータがないためETKDGの初期構造を使用しました。")
        if force_field != "none" and not converged:
            warnings.append("初期構造の力場最適化が収束していません。DFT構造最適化を推奨します。")
    unassigned = [entry for entry in Chem.FindPotentialStereo(mol) if str(entry.specified) == "Unspecified"]
    if unassigned:
        warnings.append("未指定の立体化学があります。生成した1つの立体配置・配座のみを計算します。")
    conformer = full.GetConformer()
    atoms3d = [{"element": a.GetSymbol(), "x": float(conformer.GetAtomPosition(i).x),
                "y": float(conformer.GetAtomPosition(i).y), "z": float(conformer.GetAtomPosition(i).z)}
               for i, a in enumerate(full.GetAtoms())]
    bonds3d = [{"a": b.GetBeginAtomIdx(), "b": b.GetEndAtomIdx(), "order": b.GetBondTypeAsDouble()} for b in full.GetBonds()]
    return {"formula": rdMolDescriptors.CalcMolFormula(full), "smiles": smiles, "mass": Descriptors.MolWt(full),
            "charge": Chem.GetFormalCharge(mol), "xyz": xyz_string(atoms3d, f"ETKDGv3 / {force_field}; {smiles}; angstrom"),
            "atoms3d": atoms3d, "bonds3d": bonds3d, "molecule": graph,
            "molblock": graph.get("molblock") or Chem.MolToMolBlock(mol),
            "geometry_source": f"ETKDGv3 / {force_field}", "warnings": warnings,
            "polymer": polymer_metadata(graph), "total_atoms": full.GetNumAtoms()}


def import_smiles(payload: dict) -> dict:
    from rdkit import Chem
    smiles = payload.get("smiles")
    if not isinstance(smiles, str) or not smiles.strip() or len(smiles) > 10000:
        raise ChemistryError("SMILESを入力してください（最大10,000文字）。")
    mol = Chem.MolFromSmiles(smiles.strip())
    return prepare_molecule(validate_mol(mol))


def import_mol(payload: dict) -> dict:
    from rdkit import Chem
    block = payload.get("molblock")
    if not isinstance(block, str) or not block.strip() or len(block) > 1_000_000:
        raise ChemistryError("有効なMOLファイルを指定してください。")
    # Only the first record of an SDF is accepted; do not accidentally merge molecules.
    if "$$$$" in block:
        records = [r.strip() for r in block.split("$$$$") if r.strip()]
        if len(records) != 1:
            raise ChemistryError("複数レコードのSDFには対応していません。1分子のMOLを使用してください。")
        block = block.split("$$$$", 1)[0]
    mol = Chem.MolFromMolBlock(block, removeHs=False, strictParsing=True)
    return prepare_molecule(validate_mol(mol))


# Static dielectric constants, matching PySCF 2.14 solvent descriptors (water: PCM default).
SOLVENTS = {"vacuum": ("真空", None), "water": ("水", 78.3553),
            "thf": ("THF", 7.4257), "toluene": ("トルエン", 2.3741),
            "chloroform": ("クロロホルム", 4.7113), "dmso": ("DMSO", 46.826)}


def validate_settings(settings: dict, atoms3d: list[dict], formal_charge: int) -> dict:
    from rdkit import Chem
    if not isinstance(settings, dict):
        raise ChemistryError("計算条件の形式が正しくありません。")
    method = settings.get("method", "B3LYP")
    basis = settings.get("basis", "sto-3g")
    task = settings.get("task", "single")
    if method not in METHODS or basis not in BASES or task not in ("single", "optimize", "frequency"):
        raise ChemistryError("計算方法・基底関数・タスクの指定が正しくありません。")
    charge = integer(settings.get("charge", formal_charge), "分子電荷", -10, 10)
    electrons = sum(Chem.GetPeriodicTable().GetAtomicNumber(a["element"]) for a in atoms3d) - charge
    if electrons <= 0:
        raise ChemistryError("電子数が0以下です。分子電荷を確認してください。")
    multiplicity = integer(settings.get("multiplicity", 1 if electrons % 2 == 0 else 2), "スピン多重度", 1, 11)
    spin = multiplicity - 1
    if spin > electrons or (electrons - spin) % 2:
        raise ChemistryError(f"電子数{electrons}と多重度{multiplicity}が一致しません。偶数電子は奇数の多重度、奇数電子は偶数の多重度を指定してください。")
    if task == "frequency":
        if spin or len(atoms3d) < 2 or len(atoms3d) > 50 or any(a["element"] == "I" for a in atoms3d):
            raise ChemistryError("振動解析は現在、閉殻一重項・水素込み2〜50原子・ヨウ素を含まない分子に対応しています。")
    solvent = settings.get("solvent", "vacuum")
    dispersion = settings.get("dispersion", "none")
    if not isinstance(solvent, str) or solvent not in SOLVENTS or dispersion not in ("none", "d3bj2b"):
        raise ChemistryError("溶媒または分散補正の指定が正しくありません。")
    if method == "HF" and dispersion != "none":
        raise ChemistryError("D3(BJ)補正は現在、B3LYP・PBE・PBE0に対応しています。HFでは「なし」を選んでください。")
    orbital_enabled = settings.get("orbitalGrids", True)
    if not isinstance(orbital_enabled, bool):
        raise ChemistryError("軌道格子の設定には真偽値を指定してください。")
    grid_size = integer(settings.get("gridSize", 28), "軌道格子数", 16, 40)
    return {"method": method, "basis": basis, "task": task, "charge": charge, "multiplicity": multiplicity,
            "spin": spin, "electrons": electrons, "solvent": solvent, "dispersion": dispersion,
            "orbitalGrids": orbital_enabled, "gridSize": grid_size,
            "threads": integer(settings.get("threads", 2), "スレッド数", 1, 16),
            "maxCycles": integer(settings.get("maxCycles", 100), "SCF最大反復数", 1, 500),
            "maxSteps": integer(settings.get("maxSteps", 50), "構造最適化最大反復数", 1, 200)}


def geometry_digest(atoms):
    # Foundation/JavaScript JSON can change the last binary floating digit.
    # Hash a chemical-coordinate precision, not language-specific float repr.
    canonical = [[a["element"], *[format(a[k], ".7f") for k in ("x", "y", "z")]] for a in atoms]
    return hashlib.sha256(json.dumps(canonical, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def conformer_search(payload):
    """A reproducible, finite sample ranked by molecular-mechanics energy."""
    from rdkit import Chem
    from rdkit.Chem import AllChem
    graph = payload.get("molecule")
    mol = molecule_from_graph(graph)
    polymer_metadata(graph)
    full = Chem.AddHs(mol)
    if full.GetNumAtoms() > MAX_QUANTUM_ATOMS:
        raise ChemistryError(f"配座探索は水素込み{MAX_QUANTUM_ATOMS}原子までです。")
    count = integer(payload.get("count", 8), "配座の試行数", 1, 30)
    seed = integer(payload.get("seed", 42), "乱数シード", 0, 2147483646)
    if full.GetNumAtoms() * count > 6000:
        raise ChemistryError("配座探索の負荷が大きいため、原子数×試行数を6000以下にしてください。")
    params = AllChem.ETKDGv3()
    params.randomSeed = seed
    params.numThreads = 1
    params.pruneRmsThresh = 0.35
    params.onlyHeavyAtomsForRMS = True
    params.enforceChirality = True
    log(f"{count}配座を探索しています（ETKDGv3、seed={seed}）…")
    ids = list(AllChem.EmbedMultipleConfs(full, numConfs=count, params=params))
    if not ids:
        raise ChemistryError("配座を生成できませんでした。結合と立体配置を確認してください。")
    if AllChem.MMFFHasAllMoleculeParams(full):
        force_field = "MMFF94"
        scores = AllChem.MMFFOptimizeMoleculeConfs(full, numThreads=1, maxIters=1000)
    elif AllChem.UFFHasAllMoleculeParams(full):
        force_field = "UFF"
        scores = AllChem.UFFOptimizeMoleculeConfs(full, numThreads=1, maxIters=1000)
    else:
        raise ChemistryError("全原子に利用できる力場がないため、配座エネルギーを比較できません。単一の3D生成を使用してください。")
    bonds = [{"a": b.GetBeginAtomIdx(), "b": b.GetEndAtomIdx(), "order": b.GetBondTypeAsDouble()} for b in full.GetBonds()]
    smiles = Chem.MolToSmiles(mol, isomericSmiles=True)
    accepted = []
    heavy = [a.GetIdx() for a in full.GetAtoms() if a.GetAtomicNum() > 1]
    for conf_id, (not_converged, energy) in sorted(zip(ids, scores), key=lambda item: item[1][1]):
        if not math.isfinite(energy):
            continue
        # Remove structures that collapsed to the same optimized conformation.
        # AlignMol with a fixed heavy-atom map avoids exponential automorphism
        # matching on long symmetric polyethylene chains.
        duplicate = False
        if len(heavy) > 2:
            from rdkit.Chem import rdMolAlign
            for prior in accepted:
                probe = Chem.Mol(full)
                rms = rdMolAlign.AlignMol(probe, full, prbCid=conf_id, refCid=prior["rdkit_id"], atomMap=[(i, i) for i in heavy])
                if rms < 0.35:
                    duplicate = True
                    break
        elif accepted:
            duplicate = True
        if duplicate:
            continue
        conf = full.GetConformer(conf_id)
        atoms = [{"element": atom.GetSymbol(), "x": float(conf.GetAtomPosition(i).x), "y": float(conf.GetAtomPosition(i).y), "z": float(conf.GetAtomPosition(i).z)} for i, atom in enumerate(full.GetAtoms())]
        geometry = {"sourceGraph": graph_signature(graph), "smiles": smiles, "atoms3d": atoms,
                    "coordinateHash": geometry_digest(atoms), "force_field": force_field,
                    "seed": seed, "conformer_id": conf_id, "energy_kcal_mol": float(energy),
                    "converged": not bool(not_converged), "units": "angstrom"}
        accepted.append({"id": f"conformer-{conf_id}", "rdkit_id": conf_id, "energy_kcal_mol": float(energy),
                         "converged": not bool(not_converged), "force_field": force_field, "geometry": geometry,
                         "atoms3d": atoms, "bonds3d": bonds,
                         "xyz": xyz_string(atoms, f"ETKDGv3 / {force_field}; seed={seed}; conformer={conf_id}; {energy:.8f} kcal/mol")})
    if not accepted:
        raise ChemistryError("有限の力場エネルギーをもつ配座が得られませんでした。")
    minimum = min(c["energy_kcal_mol"] for c in accepted)
    for item in accepted:
        item["relative_energy_kcal_mol"] = item["energy_kcal_mol"] - minimum
        item.pop("rdkit_id")
    warnings = ["力場エネルギーによる有限個の候補です。全配座の探索・熱平衡分布・HF/DFTエネルギーを意味しません。"]
    if any(str(s.specified) == "Unspecified" for s in Chem.FindPotentialStereo(mol)):
        warnings.append("未指定の立体中心があります。配座探索前に立体配置を指定すると同一立体異性体を比較できます。")
    if any(not c["converged"] for c in accepted):
        warnings.append("力場最適化が未収束の候補を含みます。収束表示を確認してください。")
    return {"molecule": graph, "sourceGraph": graph_signature(graph), "conformers": accepted,
            "requested": count, "embedded": len(ids), "distinct": len(accepted), "seed": seed,
            "force_field": force_field, "warnings": warnings}


def selected_geometry(mol, graph, geometry):
    """Check atom order, graph identity, coordinates and assigned chirality."""
    from rdkit import Chem
    from rdkit.Chem import Descriptors, rdMolDescriptors
    if not isinstance(geometry, dict) or geometry.get("sourceGraph") != graph_signature(graph):
        raise ChemistryError("選択した配座と現在の構造が一致しません。配座を探索し直してください。")
    smiles = Chem.MolToSmiles(mol, isomericSmiles=True)
    if geometry.get("smiles") != smiles or geometry.get("units") != "angstrom":
        raise ChemistryError("配座の分子情報・座標単位が一致しません。")
    atoms = geometry.get("atoms3d")
    full = Chem.AddHs(mol)
    if full.GetNumAtoms() > MAX_QUANTUM_ATOMS or not isinstance(atoms, list) or len(atoms) != full.GetNumAtoms():
        raise ChemistryError("配座の原子数が一致しないか、計算上限を超えています。")
    conf = Chem.Conformer(full.GetNumAtoms())
    for i, atom in enumerate(atoms):
        if not isinstance(atom, dict) or atom.get("element") != full.GetAtomWithIdx(i).GetSymbol():
            raise ChemistryError("配座の原子順序または元素が一致しません。")
        coords = [atom.get(c) for c in ("x", "y", "z")]
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or abs(v) > 10000 for v in coords):
            raise ChemistryError("配座座標には有限の数値を使用してください。")
        conf.SetAtomPosition(i, tuple(coords))
    if geometry.get("coordinateHash") != geometry_digest(atoms):
        raise ChemistryError("保存された配座座標が変更されています。配座を探索し直してください。")
    for bond in full.GetBonds():
        a, b = atoms[bond.GetBeginAtomIdx()], atoms[bond.GetEndAtomIdx()]
        length = math.dist([a[k] for k in ("x", "y", "z")], [b[k] for k in ("x", "y", "z")])
        if not 0.35 < length < 4.0:
            raise ChemistryError("配座の結合長が不正です。配座を探索し直してください。")
    full.RemoveAllConformers()
    full.AddConformer(conf)
    assigned = Chem.Mol(full)
    Chem.AssignAtomChiralTagsFromStructure(assigned, replaceExistingTags=True)
    for atom in full.GetAtoms():
        if atom.GetChiralTag() != Chem.ChiralType.CHI_UNSPECIFIED and atom.GetChiralTag() != assigned.GetAtomWithIdx(atom.GetIdx()).GetChiralTag():
            raise ChemistryError("配座の立体配置が描画と一致しません。配座を探索し直してください。")
    force_field = geometry.get("force_field", "unknown")
    warnings = [] if geometry.get("converged") else ["選択した配座の力場最適化は未収束です。"]
    return {"formula": rdMolDescriptors.CalcMolFormula(full), "smiles": smiles, "mass": Descriptors.MolWt(full),
            "charge": Chem.GetFormalCharge(mol), "xyz": xyz_string(atoms, f"Selected conformer / {force_field}; {smiles}; angstrom"),
            "atoms3d": atoms, "bonds3d": [{"a": b.GetBeginAtomIdx(), "b": b.GetEndAtomIdx(), "order": b.GetBondTypeAsDouble()} for b in full.GetBonds()],
            "molecule": graph, "molblock": graph.get("molblock") or Chem.MolToMolBlock(mol),
            "geometry_source": f"Selected conformer / {force_field} / seed={geometry.get('seed')} / id={geometry.get('conformer_id')}",
            "warnings": warnings, "polymer": polymer_metadata(graph), "total_atoms": full.GetNumAtoms(),
            "conformer_provenance": {k: v for k, v in geometry.items() if k != "atoms3d"}}


def check_structure(payload):
    from rdkit import Chem
    from rdkit.Chem import rdMolDescriptors
    from pyscf import gto
    graph = payload.get("molecule")
    mol = molecule_from_graph(graph)
    polymer = polymer_metadata(graph)
    full = Chem.AddHs(mol)
    total = full.GetNumAtoms()
    if total > MAX_QUANTUM_ATOMS:
        raise ChemistryError(f"計算は水素込み{MAX_QUANTUM_ATOMS}原子までです（現在{total}原子）。")
    # Basis construction requires coordinates but no geometry generation or SCF.
    atoms = [{"element": a.GetSymbol(), "x": i * 2., "y": 0., "z": 0.} for i, a in enumerate(full.GetAtoms())]
    settings = validate_settings(payload.get("settings", {}), atoms, Chem.GetFormalCharge(mol))
    ecp = {"I": settings["basis"]} if settings["basis"] in ("def2-svp", "def2-tzvp") and any(a["element"] == "I" for a in atoms) else {}
    try:
        basis_mol = gto.M(atom=[(a["element"], (a["x"], a["y"], a["z"])) for a in atoms],
                          basis=settings["basis"], ecp=ecp, charge=settings["charge"], spin=settings["spin"], verbose=0)
    except Exception as exc:
        raise ChemistryError(f"基底関数または電子状態を設定できませんでした: {exc}") from exc
    nao = basis_mol.nao_nr()
    if nao > MAX_BASIS_FUNCTIONS:
        raise ChemistryError(f"基底関数が{nao}個あり、上限{MAX_BASIS_FUNCTIONS}個を超えています。")
    warnings = []
    unassigned = [s.centeredOn for s in Chem.FindPotentialStereo(mol) if str(s.specified) == "Unspecified"]
    if unassigned:
        warnings.append("未指定の立体配置があります。1つの立体異性体・配座を用いる計算です。")
    if settings["charge"] != Chem.GetFormalCharge(mol):
        warnings.append("描画の形式電荷と計算電荷が異なります。電子数のみを変更します。")
    if polymer:
        warnings += [polymer["description"]]
        if polymer.get("stereoNote"):
            warnings.append(polymer["stereoNote"])
    if ecp:
        warnings.append("Iには28電子のdef2 ECPを適用します。電子数欄は全電子数、実計算電子数はECP除去後です。")
    Chem.AssignStereochemistry(mol, cleanIt=True, force=True)
    return {"valid": True, "formula": rdMolDescriptors.CalcMolFormula(full), "smiles": Chem.MolToSmiles(mol, isomericSmiles=True),
            "total_atoms": total, "heavy_atoms": mol.GetNumHeavyAtoms(), "electrons": settings["electrons"],
            "explicit_electrons": basis_mol.nelectron, "charge": settings["charge"], "multiplicity": settings["multiplicity"],
            "basis_functions": nao, "settings": settings, "warnings": warnings, "issues": [],
            "stereo": [{"atom_id": graph["atoms"][a.GetIdx()]["id"], "cip": a.GetProp("_CIPCode")} for a in mol.GetAtoms() if a.HasProp("_CIPCode")],
            "unassigned_stereo": unassigned, "polymer": polymer}


def orbital_grids(mf, spin, grid_size=28):
    """Evaluate actual converged MO amplitudes on a bounded regular grid.

    Grid vectors are steps in bohr; flat values are C-order [x,y,z].
    Display grids intentionally do not claim quantitative integration accuracy.
    """
    import numpy as np
    positions = mf.mol.atom_coords()  # bohr
    origin = positions.min(axis=0) - 3.5
    maximum = positions.max(axis=0) + 3.5
    steps = (maximum - origin) / (grid_size - 1)
    axes = np.diag(steps)
    indices = np.stack(np.meshgrid(*[np.arange(grid_size)] * 3, indexing="ij"), axis=-1).reshape(-1, 3)
    coords = origin + indices * steps
    channels = [("alpha", mf.mo_coeff[0], mf.mo_occ[0], mf.mo_energy[0]), ("beta", mf.mo_coeff[1], mf.mo_occ[1], mf.mo_energy[1])] if spin else [("restricted", mf.mo_coeff, mf.mo_occ, mf.mo_energy)]
    requests = []
    for channel, coefficients, occupations, energies in channels:
        occupied = np.flatnonzero(np.asarray(occupations) > 1e-8)
        empty = np.flatnonzero(np.asarray(occupations) <= 1e-8)
        for label, orbital in (("HOMO", int(occupied[-1]) if occupied.size else None), ("LUMO", int(empty[0]) if empty.size else None)):
            if orbital is not None:
                requests.append((label, channel, orbital, coefficients[:, orbital], float(energies[orbital] * HARTREE_EV)))
    if not requests:
        return []
    coefficients = np.stack([r[3] for r in requests], axis=1)
    values = np.empty((len(coords), len(requests)))
    for start in range(0, len(coords), 2048):
        values[start:start + 2048] = mf.mol.eval_gto("GTOval_sph", coords[start:start + 2048]).dot(coefficients)
    return [{"label": label, "spin": channel, "index": orbital, "energy_ev": energy,
             "shape": [grid_size] * 3, "origin_bohr": origin.tolist(), "axes_bohr": axes.tolist(),
             "values": np.round(values[:, i], 7).tolist(), "units": "bohr^-3/2", "order": "C[x,y,z]",
             "recommended_isovalue": 0.025,
             "note": "可視化用の有限格子。軌道の位相符号は任意で、積分・精密な空間分解能を保証しません。"}
            for i, (label, channel, orbital, _, energy) in enumerate(requests)]


def orbital_summary(mf, spin: int) -> list[dict]:
    import numpy as np
    channels = [("alpha", mf.mo_energy[0], mf.mo_occ[0]), ("beta", mf.mo_energy[1], mf.mo_occ[1])] if spin else [("restricted", mf.mo_energy, mf.mo_occ)]
    result = []
    for name, energies, occupations in channels:
        energies = np.asarray(energies)
        occupations = np.asarray(occupations)
        occupied, virtual = energies[occupations > 1e-8], energies[occupations <= 1e-8]
        homo = float(occupied.max() * HARTREE_EV) if occupied.size else None
        lumo = float(virtual.min() * HARTREE_EV) if virtual.size else None
        result.append({"spin": name, "homo_ev": homo, "lumo_ev": lumo,
                       "gap_ev": lumo - homo if homo is not None and lumo is not None else None})
    return result


def analyze_vibrations(mol, hessian):
    import numpy as np
    from pyscf.hessian import thermo
    from pyscf.data import nist
    if not np.isfinite(hessian).all():
        raise ChemistryError("Hessianに非有限値があります。振動解析を完了できませんでした。")
    analysis = thermo.harmonic_analysis(mol, hessian, exclude_trans=True, exclude_rot=True, imaginary_freq=False)
    frequencies = np.asarray(analysis["freq_wavenumber"], dtype=float)
    if not np.isfinite(frequencies).all():
        raise ChemistryError("振動数が非有限値です。構造を確認してください。")
    imaginary = int(np.count_nonzero(frequencies < 0))
    low = int(np.count_nonzero(np.abs(frequencies) < 20))
    note = "調和近似・未スケーリングの振動数です。並進・回転を除去しています。IR強度・エントロピー・自由エネルギーは未計算です。"
    if imaginary:
        note += " 虚振動があります。極小構造とは判定できません。小さな虚振動は収束条件・積分格子への依存性も確認してください。"
    elif low:
        note += " 虚振動はありませんが、20 cm⁻¹未満の低振動数があります。柔らかい運動と数値精度を確認してください。"
    else:
        note += " この計算条件で虚振動は検出されませんでした。大域的な最低エネルギー構造の保証ではありません。"
    zpe = None if imaginary else float(.5 * frequencies.sum() * 100 * nist.LIGHT_SPEED_SI * nist.PLANCK / nist.HARTREE2J)
    return {"frequencies_cm1": frequencies.tolist(), "reduced_masses_amu": analysis["reduced_mass"].tolist(),
            "normal_modes": analysis["norm_mode"].tolist(), "imaginary_count": imaginary, "low_frequency_count": low,
            "zpe_hartree": zpe, "mass_convention": "isotope-averaged atomic masses", "note": note}


def dispersion_hessian(mol, method):
    """Central difference of the official D3 analytic gradient, in atomic units."""
    import numpy as np
    from dftd3.pyscf import DFTD3Dispersion
    coordinates = mol.atom_coords()
    step = 1e-4  # Bohr
    matrix = np.empty((3 * mol.natm, 3 * mol.natm))
    for atom in range(mol.natm):
        for axis in range(3):
            gradients = []
            for sign in (-1, 1):
                displaced = coordinates.copy()
                displaced[atom, axis] += sign * step
                current = mol.copy().set_geom_(displaced, unit="Bohr")
                gradients.append(DFTD3Dispersion(current, xc=method.lower(), version="d3bj", atm=False).kernel()[1])
            matrix[:, atom * 3 + axis] = ((gradients[1] - gradients[0]) / (2 * step)).reshape(-1)
    matrix = (matrix + matrix.T) / 2
    return matrix.reshape(mol.natm, 3, mol.natm, 3).transpose(0, 2, 1, 3)


def apply_environment(mf, settings):
    if settings["dispersion"] != "none":
        # Explicit two-body convention; no implicit ATM term or double counting.
        from dftd3 import pyscf as d3
        mf = d3.energy(mf, version="d3bj", atm=False)
    if settings["solvent"] != "vacuum":
        from pyscf import solvent
        mf = solvent.PCM(mf)
        mf.with_solvent.method = "IEF-PCM"
        mf.with_solvent.eps = SOLVENTS[settings["solvent"]][1]
        mf.with_solvent.lebedev_order = 29
        mf.with_solvent.vdw_scale = 1.2
        mf.with_solvent.equilibrium_solvation = True
    return mf


def calculate(payload: dict) -> dict:
    import numpy as np
    import pyscf
    import rdkit
    from pyscf import dft, scf, gto, lib
    from rdkit import Chem
    started = time.monotonic()
    rd_mol = molecule_from_graph(payload.get("molecule"))
    prepared = selected_geometry(rd_mol, payload["molecule"], payload["geometry"]) if payload.get("geometry") is not None else prepare_molecule(rd_mol, payload["molecule"])
    settings = validate_settings(payload.get("settings", {}), prepared["atoms3d"], prepared["charge"])
    settings.update({"gridLevel": None if settings["method"] == "HF" else 3, "scfTolerance": 1e-9})
    lib.num_threads(min(settings["threads"], os.cpu_count() or 1))
    warnings = list(prepared["warnings"])
    if settings["solvent"] != "vacuum":
        warnings.append(f"{SOLVENTS[settings['solvent']][0]}のIEF-PCM連続誘電体モデルです。明示的な溶媒分子や非静電的な溶媒和項は含みません。全エネルギーは溶媒和自由エネルギーそのものではありません。")
    if settings["dispersion"] != "none":
        warnings.append("D3(BJ)の二体分散補正を全エネルギー・勾配に含めています。ATM三体項は含めません。")
    if prepared.get("polymer"):
        warnings.append(prepared["polymer"]["description"])
        if prepared["polymer"].get("stereoNote"):
            warnings.append(prepared["polymer"]["stereoNote"])
        warnings.append("有限鎖の1配座の計算です。重合度・末端・配座への依存性を確認してください。")
    if settings["charge"] != prepared["charge"]:
        warnings.append("描画の形式電荷と計算の分子電荷が異なります。核と水素の数は保持し、電子数のみ変更しました。")
    if not settings["spin"] and sum(a.GetNumRadicalElectrons() for a in rd_mol.GetAtoms()) > 1:
        warnings.append("一重項は閉殻RKS/RHFで計算します。開殻一重項・ビラジカルの電子状態は扱いません。")
    # Def2 for iodine uses a 28-electron pseudopotential. Apply it explicitly.
    ecp = {"I": settings["basis"]} if settings["basis"] in ("def2-svp", "def2-tzvp") and any(a["element"] == "I" for a in prepared["atoms3d"]) else {}
    if ecp:
        warnings.append("I（ヨウ素）にはdef2の有効内殻ポテンシャル（ECP）を使用しています。")
    try:
        mol = gto.M(atom=[(a["element"], (a["x"], a["y"], a["z"])) for a in prepared["atoms3d"]],
                    unit="Angstrom", basis=settings["basis"], ecp=ecp,
                    charge=settings["charge"], spin=settings["spin"], verbose=4, max_memory=2000)
    except Exception as exc:
        raise ChemistryError(f"基底関数または電子状態を設定できませんでした: {exc}") from exc

    if mol.nao_nr() > MAX_BASIS_FUNCTIONS:
        raise ChemistryError(f"基底関数が{mol.nao_nr()}個あります。このMac用アプリの上限{MAX_BASIS_FUNCTIONS}個を超えるため、重合度または基底関数を小さくしてください。")

    def make_scf(current_mol):
        if settings["method"] == "HF":
            mf = scf.UHF(current_mol) if settings["spin"] else scf.RHF(current_mol)
        else:
            mf = dft.UKS(current_mol) if settings["spin"] else dft.RKS(current_mol)
            mf.xc = settings["method"]
            mf.grids.level = settings["gridLevel"]
        mf = apply_environment(mf, settings)
        mf.conv_tol = settings["scfTolerance"]
        mf.max_cycle = settings["maxCycles"]
        mf.verbose = 4
        def report_cycle(env):
            log(f"SCF {int(env.get('cycle', 0)) + 1}: {float(env.get('e_tot', 0)):.12f} Hartree")
        mf.callback = report_cycle
        return mf

    formalism = ("UHF" if settings["spin"] else "RHF") if settings["method"] == "HF" else ("UKS" if settings["spin"] else "RKS")
    log(f"{settings['method']}/{settings['basis']} ・ {formalism} ・ {settings['electrons']}電子 ・ {mol.nao_nr()}基底関数")
    mf = make_scf(mol)
    geometry_converged = None
    if settings["task"] in ("optimize", "frequency") and mol.natm > 1:
        from pyscf.geomopt import geometric_solver
        log(f"{settings['method']}構造最適化を開始します…")
        # optimize() discards the convergence flag; kernel() preserves it.
        geometry_converged, optimized = geometric_solver.kernel(mf, assert_convergence=True, maxsteps=settings["maxSteps"])
        if not geometry_converged:
            raise ChemistryError("構造最適化が最大反復数までに収束しませんでした。最大ステップ数を増やすか構造を確認してください。")
        mol = optimized
        mf = make_scf(mol)
        log("最適化後の構造で最終SCFを計算します…")
    elif settings["task"] in ("optimize", "frequency"):
        geometry_converged = True
        warnings.append("単原子なので構造最適化する自由度はありません。")
    mf.kernel()
    if not mf.converged or not math.isfinite(float(mf.e_tot)):
        raise ChemistryError("SCFが収束しませんでした。最大反復数、分子電荷、多重度または初期構造を見直してください。")
    positions = mol.atom_coords(unit="Angstrom")
    atoms3d = [{"element": mol.atom_symbol(i), "x": float(pos[0]), "y": float(pos[1]), "z": float(pos[2])}
               for i, pos in enumerate(positions)]
    dipole = np.asarray(mf.dip_moment(unit="Debye", verbose=0), dtype=float).tolist()
    if settings["charge"]:
        warnings.append("荷電分子の双極子モーメントはXYZ座標の原点に依存します。")
    if settings["task"] == "single":
        warnings.append("単一点計算は選択または生成した初期3D構造を使用しました。量子化学計算で構造最適化したエネルギーではありません。")
    elif settings["task"] != "frequency":
        warnings.append("振動解析は実施していないため、極小構造であることは未確認です。")
    warnings.append("HF分子軌道のエネルギー差で、光学的励起エネルギーではありません。" if settings["method"] == "HF" else "軌道エネルギー差はKohn–Sham軌道の差で、光学的励起エネルギーではありません。")
    result = {"energy_hartree": float(mf.e_tot), "converged": True,
              "geometry_converged": bool(geometry_converged) if geometry_converged is not None else None,
              "method": settings["method"], "basis": settings["basis"], "task": settings["task"],
              "formula": prepared["formula"], "mass": prepared["mass"], "smiles": prepared["smiles"], "charge": settings["charge"],
              "multiplicity": settings["multiplicity"], "electrons": settings["electrons"],
              "xyz": xyz_string(atoms3d, f"{settings['method']}/{settings['basis']}; {mf.e_tot:.12f} Hartree; angstrom"),
              "initial_xyz": prepared["xyz"], "atoms3d": atoms3d, "bonds3d": prepared["bonds3d"],
              "orbitals": orbital_summary(mf, settings["spin"]), "dipole_debye": dipole,
              "scf_cycles": int(getattr(mf, "cycles", 0)), "elapsed_seconds": round(time.monotonic() - started, 3),
              "warnings": warnings,
              "geometry_source": "PySCF / geomeTRIC" if settings["task"] in ("optimize", "frequency") and mol.natm > 1 else prepared["geometry_source"],
              "initial_geometry_source": prepared["geometry_source"],
              "settings": settings, "versions": {"pyscf": pyscf.__version__, "rdkit": rdkit.__version__, "python": platform.python_version()},
              "molecule": payload["molecule"], "molblock": prepared["molblock"],
              "polymer": prepared.get("polymer"), "formalism": formalism, "basis_functions": mol.nao_nr(),
              "orbital_type": "Hartree–Fock MO" if settings["method"] == "HF" else "Kohn–Sham orbital"}
    if settings["task"] == "frequency":
        log("最適化構造のHessianと基準振動を計算しています（D3寄与は勾配の数値差分）…")
        # Import explicitly for both registration and the frozen application bundle.
        from pyscf.hessian import rhf, rks
        hessian = mf.Hessian().kernel()
        if settings["dispersion"] != "none":
            hessian += dispersion_hessian(mol, settings["method"])
        result["vibrations"] = analyze_vibrations(mol, hessian)
        result["warnings"].append(result["vibrations"]["note"])
        result["elapsed_seconds"] = round(time.monotonic() - started, 3)
    result["environment"] = {"solvent": settings["solvent"], "label": SOLVENTS[settings["solvent"]][0],
        "model": "vacuum" if settings["solvent"] == "vacuum" else "IEF-PCM",
        "dielectric": SOLVENTS[settings["solvent"]][1], "dispersion": settings["dispersion"],
        "dispersion_energy_hartree": float(mf.scf_summary.get("dispersion", 0.)),
        "solvent_polarization_energy_hartree": float(getattr(getattr(mf, "with_solvent", None), "e", 0.) or 0.),
        "cavity": None if settings["solvent"] == "vacuum" else {"vdw_scale": 1.2, "lebedev_order": 29, "surface": "SWIG"}}
    if settings["dispersion"] != "none":
        import importlib.metadata
        result["versions"]["dftd3"] = importlib.metadata.version("dftd3")
    _, atom_charges = mf.mulliken_pop(verbose=0)
    result["charges"] = {"method": "Mulliken", "units": "e", "values": np.asarray(atom_charges, dtype=float).tolist(),
                         "note": "Mulliken電荷は基底関数と電子状態に依存する分布解析値です。形式電荷・観測量とは異なります。"}
    if settings["orbitalGrids"]:
        log("収束した波動関数からHOMO / LUMOの空間格子を計算しています…")
        result["orbital_grids"] = orbital_grids(mf, settings["spin"], settings["gridSize"])
    else:
        result["orbital_grids"] = []
    if prepared.get("conformer_provenance"):
        result["conformer_provenance"] = prepared["conformer_provenance"]
    if settings["task"] in ("optimize", "frequency") and mol.natm > 1:
        result["versions"]["geometric"] = geometric_solver.geometric.__version__
    if settings["spin"]:
        s2, effective_multiplicity = mf.spin_square()
        result["spin_square"] = float(s2)
        result["effective_multiplicity"] = float(effective_multiplicity)
        target_s = settings["spin"] / 2
        if abs(s2 - target_s * (target_s + 1)) > .1:
            result["warnings"].append("非制限波動関数にスピン汚染があります。出力の〈S²〉を確認してください。")
    return result


def dispatch(request: dict) -> dict:
    if not isinstance(request, dict):
        raise ChemistryError("リクエストはJSONオブジェクトで指定してください。")
    op, payload = request.get("op"), request.get("payload", {})
    if not isinstance(payload, dict):
        raise ChemistryError("リクエスト内容の形式が正しくありません。")
    if op == "status":
        return status()
    if op == "buildPolymer":
        return build_polymer(payload)
    if op == "clean2D":
        return clean_2d(payload)
    if op in ("checkStructure", "preflight"):
        return check_structure(payload)
    if op == "conformers":
        return conformer_search(payload)
    if op == "importSmiles":
        return import_smiles(payload)
    if op == "importMol":
        return import_mol(payload)
    if op == "prepare":
        return prepare_molecule(molecule_from_graph(payload.get("molecule")), payload["molecule"])
    if op == "calculate":
        return calculate(payload)
    raise ChemistryError(f"未対応の操作です: {op}")


def main() -> None:
    try:
        raw = sys.stdin.read(2_000_001)
        if len(raw) > 2_000_000:
            raise ChemistryError("リクエストが大きすぎます。")
        result = {"ok": True, "data": dispatch(json.loads(raw))}
    except (ImportError, OSError) as exc:
        result = {"ok": False, "error": f"計算環境を読み込めません。セットアップを実行してください: {exc}"}
    except Exception as exc:
        result = {"ok": False, "error": str(exc) or type(exc).__name__}
    # Strict JSON prevents accidental NaN/Infinity leaking into JavaScript.
    try:
        encoded = json.dumps(result, ensure_ascii=False, allow_nan=False)
    except ValueError:
        encoded = json.dumps({"ok": False, "error": "計算結果に非有限値が含まれています。"}, ensure_ascii=False)
    print("__RESULT__" + encoded, flush=True)


if __name__ == "__main__":
    main()
