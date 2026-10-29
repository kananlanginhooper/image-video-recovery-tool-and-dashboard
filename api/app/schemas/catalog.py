"""Responses for the catalogue: lists, one item, counts."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class Tile(BaseModel):
    """One item in a list. `st` is a plugin's status ('none' without one); `hidden` items are blurred until clicked."""

    model_config = ConfigDict(populate_by_name=True)

    hash: str
    grp: str | None
    kind: str | None
    taken: datetime | None
    class_: str | None = Field(alias="class")
    path: str | None
    st: str
    hidden: bool


class BrowsePage(BaseModel):
    items: list[Tile]
    total: int
    page: int
    pages: int
    ctx: str = Field(description="the list, for the viewer's previous/next (pass back as ?ctx=)")


class FolderRow(BaseModel):
    path: str
    name: str
    n: int
    v: int = Field(description="videos")


class FolderList(BaseModel):
    prefix: str
    here: int = Field(description="items directly in the prefix folder")
    folders: list[FolderRow]


class StatusInfo(BaseModel):
    label: str
    values: list[str]
    hidden: list[str]


class Meta(BaseModel):
    classes: list[str]
    page_size: int
    subtypes: dict[str, str]
    status: StatusInfo
    class_counts: dict[str, int]


class Copy(BaseModel):
    path: str
    size: int | None


class Derived(BaseModel):
    derivation: str
    path: str


class Ocr(BaseModel):
    text: str
    conf: float | None


class Extra(BaseModel):
    """A plugin's line in the item details; any other keys make it a link handed back to the plugin."""

    model_config = ConfigDict(extra="allow")

    label: str
    text: str


class Item(BaseModel):
    hash: str
    grp: str
    kind: str
    class_: str = Field(alias="class")
    taken: datetime | None
    taken_source: str | None
    size: int | None
    width: int | None
    height: int | None
    duration: float | None
    folder: str
    st: str
    hidden: bool
    playable: bool
    prev: str | None
    next: str | None
    extras: list[Extra]
    copies: list[Copy]
    derived: list[Derived]
    ocr: Ocr | None

    model_config = ConfigDict(populate_by_name=True)


class StatsRow(BaseModel):
    grp: str
    class_: str = Field(alias="class")
    st: str
    n: int

    model_config = ConfigDict(populate_by_name=True)


class Stats(BaseModel):
    rows: list[StatsRow]


class Health(BaseModel):
    ok: bool
    items: int
    at: str
