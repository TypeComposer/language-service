function init(modules) {
	const ts = modules.typescript;
	console.log('TypeScript plugin initialized');

	function create(info) {
		// Hook para arquivos virtuais
		const oldGetScriptFileNames = info.languageServiceHost.getScriptFileNames;
		info.languageServiceHost.getScriptFileNames = () => {
			const files = oldGetScriptFileNames.call(info.languageServiceHost);
			// 🔹 Adiciona os virtuais ao projeto
			for (const [real, virt] of globalThis.__templateVirtualFiles || []) {
				if (!files.includes(virt)) {
					files.push(virt);
				}
			}
			return files;
		};

		// Hook para conteúdo dos virtuais
		const oldGetScriptSnapshot = info.languageServiceHost.getScriptSnapshot;
		info.languageServiceHost.getScriptSnapshot = (fileName) => {
			console.log('getScriptSnapshot', fileName);
			if (fileName.startsWith('tsx-template-virtual:')) {
				const map = globalThis.__templateVirtualFiles || new Map();
				const content = map.get(fileName);
				if (content) {
					return ts.ScriptSnapshot.fromString(content);
				}
			}
			return oldGetScriptSnapshot.call(info.languageServiceHost, fileName);
		};

		return info.languageService;
	}

	return { create };
}

module.exports = init;
