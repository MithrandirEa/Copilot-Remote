with open("/opt/n8n/Caddyfile", "r") as f:
    lines = f.readlines()

start = None
depth = 0
end = None
for i, line in enumerate(lines):
    if start is None and "copilot.mithrandirea.info" in line and "{" in line:
        start = i
        depth = line.count("{") - line.count("}")
    elif start is not None:
        depth += line.count("{") - line.count("}")
        if depth <= 0:
            end = i
            break

with open("/tmp/copilot_caddy.conf", "r") as f:
    new_block = f.read()

new_lines = []
in_block = False
for line in new_block.splitlines(keepends=True):
    if "copilot.mithrandirea.info" in line:
        in_block = True
    if in_block:
        new_lines.append(line)
new_block_clean = "".join(new_lines)

if start is not None and end is not None:
    result = lines[:start] + [new_block_clean + "\n"] + lines[end+1:]
    print(f"Bloc remplace (lignes {start}-{end})")
else:
    result = lines + ["\n" + new_block_clean + "\n"]
    print("Bloc ajoute a la fin")

with open("/opt/n8n/Caddyfile", "w") as f:
    f.writelines(result)
