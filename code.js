// Plugin: Where is the token - Encuentra dónde se usa una variable de diseño
figma.showUI(__html__, { width: 380, height: 520 });

function getVariableDisplayName(variable, collectionByName) {
  const collection = collectionByName[variable.variableCollectionId];
  const collName = collection ? collection.name : "";
  const vName = variable.name || "";
  if (!collName) return vName;
  return `${collName}: ${vName}`;
}

function variableMatchesSearch(variable, collectionByName, search) {
  if (!search || !variable.name) return false;
  const normalizedSearch = search.trim().toLowerCase();
  const displayName = getVariableDisplayName(variable, collectionByName).toLowerCase();
  const varName = variable.name.toLowerCase();
  const collection = collectionByName[variable.variableCollectionId];
  const withSlash = collection ? `${collection.name.toLowerCase()}/${varName}` : varName;
  return (
    displayName === normalizedSearch ||
    varName === normalizedSearch ||
    displayName.includes(normalizedSearch) ||
    varName.includes(normalizedSearch) ||
    withSlash.includes(normalizedSearch)
  );
}

function collectBoundVariableIds(node) {
  const ids = new Set();
  const bv = node.boundVariables;
  if (!bv) return ids;
  for (const key of Object.keys(bv)) {
    const val = bv[key];
    if (val && typeof val === "object") {
      if (Array.isArray(val)) {
        val.forEach((alias) => {
          if (alias && alias.type === "VARIABLE_ALIAS" && alias.id) ids.add(alias.id);
        });
      } else if (val.type === "VARIABLE_ALIAS" && val.id) {
        ids.add(val.id);
      }
    }
  }
  if (node.type === "TEXT" && node.getStyledTextSegments) {
    try {
      const segments = node.getStyledTextSegments(["boundVariables"]);
      segments.forEach((seg) => {
        const bvs = seg.boundVariables;
        if (bvs) {
          Object.keys(bvs).forEach((k) => {
            const alias = bvs[k];
            if (alias && alias.id) ids.add(alias.id);
          });
        }
      });
    } catch (_) {}
  }
  return ids;
}

var TYPE_LABELS = {
  TEXT: "Text",
  RECTANGLE: "Vector",
  ELLIPSE: "Vector",
  LINE: "Vector",
  VECTOR: "Vector",
  BOOLEAN_OPERATION: "Vector",
  STAR: "Vector",
  POLYGON: "Vector",
  FRAME: "Frame",
  COMPONENT: "Componente",
  INSTANCE: "Instancia",
  GROUP: "Grupo",
  SECTION: "Sección",
};
function getTypeLabel(type) {
  return TYPE_LABELS[type] || type;
}

function getComponentName(node) {
  if (node.type === "INSTANCE" && node.mainComponent) {
    return node.mainComponent.name;
  }
  var n = node.parent;
  while (n) {
    if (n.type === "COMPONENT" || n.type === "COMPONENT_SET") return n.name;
    n = n.parent;
  }
  return null;
}

function truncate(str, maxLen) {
  if (!str) return "Sin nombre";
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "...";
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === "search-token") {
    const searchQuery = (msg.query || "").trim();
    if (!searchQuery) {
      figma.ui.postMessage({ type: "search-result", results: [], error: "Escribe el nombre del token." });
      return;
    }

    try {
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      const collectionById = {};
      collections.forEach((c) => (collectionById[c.id] = c));

      const allVariables = await figma.variables.getLocalVariablesAsync();
      const matchingVariableIds = new Set();
      allVariables.forEach((v) => {
        if (variableMatchesSearch(v, collectionById, searchQuery)) matchingVariableIds.add(v.id);
      });

      if (matchingVariableIds.size === 0) {
        figma.ui.postMessage({
          type: "search-result",
          results: [],
          error: "No se encontró ninguna variable con ese nombre.",
        });
        return;
      }

      const nodes = figma.currentPage.findAll(() => true);
      const results = [];
      const seen = new Set();

      nodes.forEach((node) => {
        const boundIds = collectBoundVariableIds(node);
        for (const id of boundIds) {
          if (matchingVariableIds.has(id) && !seen.has(node.id)) {
            seen.add(node.id);
            var componentName = getComponentName(node);
            results.push({
              id: node.id,
              componentName: componentName || "—",
              layerName: truncate(node.name || "Sin nombre", 30),
              layerNameFull: node.name || "Sin nombre",
              type: node.type,
              typeLabel: getTypeLabel(node.type),
            });
            break;
          }
        }
      });

      figma.ui.postMessage({
        type: "search-result",
        results,
        error: results.length === 0 ? "Ningún elemento en esta página usa ese token." : null,
      });
    } catch (e) {
      figma.ui.postMessage({
        type: "search-result",
        results: [],
        error: "Error al buscar: " + (e.message || String(e)),
      });
    }
  }

  if (msg.type === "select-nodes") {
    const ids = msg.ids || [];
    const nodes = [];
    for (const id of ids) {
      const node = await figma.getNodeByIdAsync(id);
      if (node) nodes.push(node);
    }
    if (nodes.length > 0) {
      figma.currentPage.selection = nodes;
      figma.viewport.scrollAndZoomIntoView(nodes);
    }
  }

  if (msg.type === "cancel") {
    figma.closePlugin();
  }
};
