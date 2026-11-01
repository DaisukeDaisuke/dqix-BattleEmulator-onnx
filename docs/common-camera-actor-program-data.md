# Initial resident camera definitions

The development extractor `scripts/extract-camera-actor-program-data.mjs`
packages the action memberships and selector-relevant linked nodes from
the original enemy and party character archives. Runtime execution needs
neither a ROM nor those archives. No drawing or animation assets are included.

The current extraction contains 616 selected files and 1,509 linked programs.
Every one of the 312 model names in the monster definitions resolves by the
original filename CRC. Thirteen ordinary party program archives and two
special loose character archives also contain resident programs. This is an
extraction count, not a claim that every battle transition is implemented.

Original scene initialization references `data/pack_lv5/enemy.gp2` and the
format `%s.mon`; party setup references `data/pack_lv5/chara_mp.gp2` and
`%sb.chr`. Those strings were read directly from the JPN overlay. The matching
`func_ov000_02166070`, `func_ov000_02164fac` and `Filesystem/FileIO.cpp` establish
how these containers select their program data.

`FindFilesInNarcBySubstring(..., ".bact", ..., 1)` enumerates from file index
zero and takes the first match. Its final argument is a maximum result count.
The extractor therefore preserves original file order even when the internal
script name differs from the outer model name or several `.bact` files exist.
Selecting a same-named file instead would change some initial resident chains.

The shared decoder is the same one used for the independently verified shared
358-program definitions. All 616 actor files were then executed through the
unmodified original parser, constructors and allocator under strict initialized
memory checks. The run executed 81,625,432 original ARM instructions. All
19,084 compared action IDs, node kinds, parameters, links and referenced path
fields matched; observed outputs were never used to produce the metadata.

These definitions are not yet connected to implicit runtime actor
initialization; explicit initial resident chains remain authoritative.
Integration and a joint state/RNG proof are separate next steps.
