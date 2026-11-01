# Official tool references

The C# files in this folder were read from the official Effekseer repository at tag `170e`, solely to understand the supported project parameters and CLI. They are reference source, not the game runtime. `cli.cs` is `Dev/Editor/Effekseer/Program.cs`; `ring.cs` is `Dev/Editor/EffekseerCore/Data/RendererValues.cs`; the remaining C# filenames match `Dev/Editor/EffekseerCore/Data/`.

Source: https://github.com/effekseer/Effekseer/tree/170e

`EFFEKSEER-LICENSE.txt` preserves the official license. `WEBGL-LICENSE.txt` preserves the official WebGL runtime license. No contributed sample effect, texture, character, or model has been incorporated into the authored assets. The empty project here is a CLI environment probe, not a character or game asset.

Blender is used as an external authoring executable. The editable model, animation, scripts and rendered frames in the parent folder were created for this task; Blender itself is not bundled into the game. Official downloads and hashes are recorded in `../toolchain.json`.
