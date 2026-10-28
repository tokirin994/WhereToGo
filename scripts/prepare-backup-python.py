"""Copy the selected interpreter's installed SSH dependencies into the private D: app folder."""
import importlib.metadata,json,pathlib,shutil,sys
from packaging.requirements import Requirement
target=pathlib.Path(sys.argv[1]).resolve();target.mkdir(parents=True,exist_ok=True)
copied={}
def copy_distribution(name):
    distribution=importlib.metadata.distribution(name)
    canonical=distribution.metadata['Name'].lower().replace('_','-')
    if canonical in copied:return
    copied[canonical]=distribution.version
    for entry in distribution.files or []:
        relative=pathlib.PurePosixPath(str(entry).replace('\\','/'))
        if relative.is_absolute() or '..' in relative.parts:continue
        source=pathlib.Path(distribution.locate_file(entry))
        if source.is_file():
            destination=target.joinpath(*relative.parts);destination.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,destination)
    for spec in distribution.requires or []:
        requirement=Requirement(spec)
        if requirement.marker is None or requirement.marker.evaluate({'extra':''}):copy_distribution(requirement.name)
copy_distribution('paramiko')
(target/'backup-dependencies.json').write_text(json.dumps(copied,indent=2),encoding='utf-8')
print('Prepared private backup Python dependencies: '+', '.join(sorted(copied)))
