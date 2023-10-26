import semver
import toml

# Define your pyproject.toml and version.py file paths
pyprojectTomlPath = "pyproject.toml"
versionPyPath = "retoolrpc/version.py"

# Read the current pyproject.toml
with open(pyprojectTomlPath, "r") as tomlFile:
    pyprojectToml = toml.load(tomlFile)

# Read the current version from version.py
currentVersion = pyprojectToml["tool"]["poetry"]["version"]
# You can use 'bump_minor' or 'bump_major' to increment accordingly
newVersion = semver.bump_patch(currentVersion)

# Update version in pyproject.toml
pyprojectToml["tool"]["poetry"]["version"] = newVersion
with open(pyprojectTomlPath, "w") as tomlFile:
    toml.dump(pyprojectToml, tomlFile)

# Update version in version.py
versionPyContent = f'__version__ = "{newVersion}"\n'
with open(versionPyPath, "w") as versionPyFile:
    versionPyFile.write(versionPyContent)

print(f"Version bumped to {newVersion}")
