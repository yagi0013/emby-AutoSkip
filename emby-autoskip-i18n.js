// ==UserScript==
// @name         Emby AutoSkip - Language Plugin
// @namespace    local.emby.autoskip
// @version      1.0.0
// @description  Optional language pack for Emby AutoSkip
// @match        http://*/*
// @match        https://*/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (!/\/web(?:\/|$)/i.test(location.pathname)) return;

  const API_VERSION = 1;
  const translations = {
    en: {
      cancel: 'Cancel', auto: 'Auto (browser)', language: 'Display language',
      languagePluginHint: 'Add the language plugin to enable multilingual display',
      handleAria: 'AutoSkip settings. Click to open; drag vertically to move',
      handleTitle: 'Click: settings / Drag vertically: move',
      drawerAria: 'Emby AutoSkip settings', title: '⏭ AutoSkip',
      syncUnavailable: 'Settings sync is unavailable',
      syncLoadFailed: 'The sync plugin could not be loaded. AutoSkip remains available.',
      suspend: 'Pause AutoSkip', global: 'Global', thisSeries: 'This series',
      thisSeason: 'This season', useGlobal: 'Use global settings',
      skipSettings: 'Skip settings', intro: 'Intro / previously on',
      op: 'Opening (OP)', outro: 'Outro (ED)', alwaysPlay: 'Always play',
      firstOnly: 'Play first time only', alwaysSkip: 'Always skip',
      resetHistory: 'Reset history',
      manualSkipHint: 'Shown for OP/ED sections set to Always play or on their first play',
      manualSkip: 'Show "Skip" during playback',
      countdown: 'Countdown (preview from {seconds}s)',
      countdownFrom: 'Countdown (preview starts {seconds}s before)',
      timeline: 'Show sections on seek bar',
      shortcutHint: 'Use Ctrl+← / Ctrl+→ to move between chapters',
      shortcut: 'Chapter shortcuts',
      badgeHint: 'Find and show skip targets. Turning this off also stops scanning.',
      badge: 'Show skip-target badges', commonDisplay: 'Common settings',
      advanced: 'Advanced settings', countdownStart: 'Preview lead',
      undoDuration: 'Undo display', menuMovement: 'Menu motion',
      actionDuration: 'Action display', secondsUnit: 's',
      restoreDefaults: 'Restore defaults', settingsData: 'Settings data',
      backupHelp: 'Move global, season, series and advanced settings, first-play history, and tab position as JSON.',
      export: 'Export', exportTitle: 'Save current settings to a JSON file',
      import: 'Import', importTitle: 'Restore settings from a JSON file',
      exported: 'Settings exported', exportFailed: 'Export failed',
      importConfirm: 'Replace the current settings, season/series settings, and first-play history with the selected backup?',
      importCancelled: 'Import cancelled',
      imported: 'Imported. Reloading the page…',
      importFailed: 'Could not import: {message}', invalidFormat: 'Invalid format',
      detectedRanges: 'Detected sections: {times}', seasonNumber: 'Season {number}',
      currentScope: 'Current: {name}', firstHistory: 'First-play history',
      done: 'done', notYet: 'not yet', pausedFeedback: 'AutoSkip paused',
      resumedFeedback: 'AutoSkip resumed',
      dragNote: 'The tab on the right can be dragged vertically',
      cancelThisSkip: 'Cancel this automatic skip',
      cancelThisSkipHint: 'Click to cancel this automatic skip',
      syncBack: '‹ Settings sync', syncDrawerAria: 'Emby settings sync',
      waitingPlayback: 'Waiting', cancelled: 'Cancelled',
      undoSkip: 'Undo skip', skipSection: 'Skip this section',
      undoHint: 'Click to return to the start of the skipped section',
      skipHint: 'Click to skip this section', undo: '↶ Undo', skip: 'Skip',
      remaining: '{time} left', waiting: 'Waiting for playback', paused: 'Paused',
      available: 'Skip available · target detected',
      unavailable: 'Skip unavailable · no target detected',
      handleStatusAria: 'AutoSkip {status}. Click for settings; drag vertically to move',
      handleStatusTitle: 'AutoSkip {status} / Click: settings / Drag vertically: move',
      chapter: 'Chapter', chapterNumber: 'Chapter {number}', beginning: 'Beginning',
      skipTarget: 'Skip target', allSkipTargets: 'All episodes have skip targets',
      someSkipTargets: 'Some episodes have skip targets',
      incompatibleLanguagePlugin: 'The language plugin is incompatible'
    },

    es: {
      cancel: 'Cancelar', auto: 'Automático (navegador)', language: 'Idioma de visualización',
      languagePluginHint: 'Añada el complemento de idiomas para activar la interfaz multilingüe',
      handleAria: 'Ajustes de AutoSkip. Haga clic para abrir; arrastre verticalmente para mover',
      handleTitle: 'Clic: ajustes / Arrastrar verticalmente: mover',
      drawerAria: 'Ajustes de Emby AutoSkip', title: '⏭ AutoSkip',
      syncUnavailable: 'La sincronización de ajustes no está disponible',
      syncLoadFailed: 'No se pudo cargar el complemento de sincronización. AutoSkip sigue disponible.',
      suspend: 'Pausar AutoSkip', global: 'Global', thisSeries: 'Esta serie',
      thisSeason: 'Esta temporada', useGlobal: 'Usar ajustes globales',
      skipSettings: 'Ajustes de salto', intro: 'Introducción / resumen anterior',
      op: 'Apertura (OP)', outro: 'Cierre (ED)', alwaysPlay: 'Reproducir siempre',
      firstOnly: 'Reproducir solo la primera vez', alwaysSkip: 'Saltar siempre',
      resetHistory: 'Restablecer historial',
      manualSkipHint: 'Se muestra en segmentos OP/ED configurados para reproducirse siempre o en su primera reproducción',
      manualSkip: 'Mostrar «Saltar» durante la reproducción',
      countdown: 'Cuenta atrás (aviso desde {seconds} s)',
      countdownFrom: 'Cuenta atrás (el aviso empieza {seconds} s antes)',
      timeline: 'Mostrar segmentos en la barra de búsqueda',
      shortcutHint: 'Use Ctrl+← / Ctrl+→ para moverse entre capítulos',
      shortcut: 'Atajos de capítulo',
      badgeHint: 'Busca y muestra objetivos de salto. Al desactivarlo también se detiene la exploración.',
      badge: 'Mostrar distintivos de salto', commonDisplay: 'Ajustes comunes',
      advanced: 'Ajustes avanzados', countdownStart: 'Inicio del aviso',
      undoDuration: 'Duración de Deshacer', menuMovement: 'Movimiento del menú',
      actionDuration: 'Duración de la acción', secondsUnit: 's',
      restoreDefaults: 'Restaurar valores', settingsData: 'Datos de ajustes',
      backupHelp: 'Transfiera como JSON los ajustes globales, de temporada, serie y avanzados, el historial y la posición de la pestaña.',
      export: 'Exportar', exportTitle: 'Guardar los ajustes actuales en un archivo JSON',
      import: 'Importar', importTitle: 'Restaurar ajustes desde un archivo JSON',
      exported: 'Ajustes exportados', exportFailed: 'Error al exportar',
      importConfirm: '¿Sustituir los ajustes actuales, los de temporada/serie y el historial por la copia seleccionada?',
      importCancelled: 'Importación cancelada', imported: 'Importado. Recargando la página…',
      importFailed: 'No se pudo importar: {message}', invalidFormat: 'Formato no válido',
      detectedRanges: 'Segmentos detectados: {times}', seasonNumber: 'Temporada {number}',
      currentScope: 'Actual: {name}', firstHistory: 'Historial de primera reproducción',
      done: 'hecho', notYet: 'pendiente', pausedFeedback: 'AutoSkip en pausa',
      resumedFeedback: 'AutoSkip reanudado',
      dragNote: 'La pestaña derecha se puede arrastrar verticalmente',
      cancelThisSkip: 'Cancelar este salto automático',
      cancelThisSkipHint: 'Haga clic para cancelar este salto automático',
      syncBack: '‹ Sincronización', syncDrawerAria: 'Sincronización de ajustes de Emby',
      waitingPlayback: 'En espera', cancelled: 'Cancelado', undoSkip: 'Deshacer salto',
      skipSection: 'Saltar este segmento',
      undoHint: 'Haga clic para volver al inicio del segmento omitido',
      skipHint: 'Haga clic para saltar este segmento', undo: '↶ Deshacer', skip: 'Saltar',
      remaining: 'Quedan {time}', waiting: 'Esperando reproducción', paused: 'En pausa',
      available: 'Salto disponible · objetivo detectado',
      unavailable: 'Salto no disponible · objetivo no detectado',
      handleStatusAria: 'AutoSkip {status}. Clic para ajustes; arrastre verticalmente para mover',
      handleStatusTitle: 'AutoSkip {status} / Clic: ajustes / Arrastrar verticalmente: mover',
      chapter: 'Capítulo', chapterNumber: 'Capítulo {number}', beginning: 'Inicio',
      skipTarget: 'Objetivo de salto', allSkipTargets: 'Todos los episodios tienen segmentos de salto',
      someSkipTargets: 'Algunos episodios tienen segmentos de salto',
      incompatibleLanguagePlugin: 'El complemento de idiomas no es compatible'
    },

    pt: {
      cancel: 'Cancelar', auto: 'Automático (navegador)', language: 'Idioma de exibição',
      languagePluginHint: 'Adicione o plugin de idiomas para ativar a exibição multilíngue',
      handleAria: 'Configurações do AutoSkip. Clique para abrir; arraste verticalmente para mover',
      handleTitle: 'Clique: configurações / Arrastar verticalmente: mover',
      drawerAria: 'Configurações do Emby AutoSkip', title: '⏭ AutoSkip',
      syncUnavailable: 'A sincronização de configurações não está disponível',
      syncLoadFailed: 'Não foi possível carregar o plugin de sincronização. O AutoSkip continua disponível.',
      suspend: 'Pausar AutoSkip', global: 'Global', thisSeries: 'Esta série',
      thisSeason: 'Esta temporada', useGlobal: 'Usar configurações globais',
      skipSettings: 'Configurações de salto', intro: 'Introdução / resumo anterior',
      op: 'Abertura (OP)', outro: 'Encerramento (ED)', alwaysPlay: 'Sempre reproduzir',
      firstOnly: 'Reproduzir somente na primeira vez', alwaysSkip: 'Sempre pular',
      resetHistory: 'Redefinir histórico',
      manualSkipHint: 'Exibido em trechos OP/ED definidos para sempre reproduzir ou na primeira reprodução',
      manualSkip: 'Mostrar “Pular” durante a reprodução',
      countdown: 'Contagem regressiva (aviso a partir de {seconds} s)',
      countdownFrom: 'Contagem regressiva (aviso começa {seconds} s antes)',
      timeline: 'Mostrar trechos na barra de busca',
      shortcutHint: 'Use Ctrl+← / Ctrl+→ para navegar entre capítulos',
      shortcut: 'Atalhos de capítulo',
      badgeHint: 'Localiza e mostra alvos de salto. Desativar também interrompe a busca.',
      badge: 'Mostrar selos de alvo de salto', commonDisplay: 'Configurações comuns',
      advanced: 'Configurações avançadas', countdownStart: 'Início do aviso',
      undoDuration: 'Exibição de desfazer', menuMovement: 'Movimento do menu',
      actionDuration: 'Exibição da ação', secondsUnit: 's',
      restoreDefaults: 'Restaurar padrões', settingsData: 'Dados das configurações',
      backupHelp: 'Transfira como JSON configurações globais, de temporada, série e avançadas, histórico e posição da aba.',
      export: 'Exportar', exportTitle: 'Salvar as configurações atuais em JSON',
      import: 'Importar', importTitle: 'Restaurar configurações de um arquivo JSON',
      exported: 'Configurações exportadas', exportFailed: 'Falha ao exportar',
      importConfirm: 'Substituir as configurações atuais, de temporada/série e o histórico pelo backup selecionado?',
      importCancelled: 'Importação cancelada', imported: 'Importado. Recarregando a página…',
      importFailed: 'Não foi possível importar: {message}', invalidFormat: 'Formato inválido',
      detectedRanges: 'Trechos detectados: {times}', seasonNumber: 'Temporada {number}',
      currentScope: 'Atual: {name}', firstHistory: 'Histórico da primeira reprodução',
      done: 'feito', notYet: 'pendente', pausedFeedback: 'AutoSkip pausado',
      resumedFeedback: 'AutoSkip retomado',
      dragNote: 'A aba da direita pode ser arrastada verticalmente',
      cancelThisSkip: 'Cancelar este salto automático',
      cancelThisSkipHint: 'Clique para cancelar este salto automático',
      syncBack: '‹ Sincronização', syncDrawerAria: 'Sincronização de configurações do Emby',
      waitingPlayback: 'Aguardando', cancelled: 'Cancelado', undoSkip: 'Desfazer salto',
      skipSection: 'Pular este trecho', undoHint: 'Clique para voltar ao início do trecho pulado',
      skipHint: 'Clique para pular este trecho', undo: '↶ Desfazer', skip: 'Pular',
      remaining: 'Restam {time}', waiting: 'Aguardando reprodução', paused: 'Pausado',
      available: 'Salto disponível · alvo detectado',
      unavailable: 'Salto indisponível · alvo não detectado',
      handleStatusAria: 'AutoSkip {status}. Clique para configurações; arraste verticalmente para mover',
      handleStatusTitle: 'AutoSkip {status} / Clique: configurações / Arrastar verticalmente: mover',
      chapter: 'Capítulo', chapterNumber: 'Capítulo {number}', beginning: 'Início',
      skipTarget: 'Alvo de salto', allSkipTargets: 'Todos os episódios têm alvos de salto',
      someSkipTargets: 'Alguns episódios têm alvos de salto',
      incompatibleLanguagePlugin: 'O plugin de idiomas é incompatível'
    },

    ru: {
      cancel: 'Отмена', auto: 'Автоматически (браузер)', language: 'Язык интерфейса',
      languagePluginHint: 'Добавьте языковой плагин для многоязычного интерфейса',
      handleAria: 'Настройки AutoSkip. Нажмите, чтобы открыть; перетаскивайте по вертикали',
      handleTitle: 'Нажатие: настройки / Перетаскивание: переместить',
      drawerAria: 'Настройки Emby AutoSkip', title: '⏭ AutoSkip',
      syncUnavailable: 'Синхронизация настроек недоступна',
      syncLoadFailed: 'Не удалось загрузить плагин синхронизации. AutoSkip продолжает работать.',
      suspend: 'Приостановить AutoSkip', global: 'Общие', thisSeries: 'Этот сериал',
      thisSeason: 'Этот сезон', useGlobal: 'Использовать общие настройки',
      skipSettings: 'Настройки пропуска', intro: 'Вступление / ранее в сериале',
      op: 'Начальная заставка (OP)', outro: 'Конечная заставка (ED)', alwaysPlay: 'Всегда воспроизводить',
      firstOnly: 'Воспроизводить только впервые', alwaysSkip: 'Всегда пропускать',
      resetHistory: 'Сбросить историю',
      manualSkipHint: 'Показывается для OP/ED с режимом «Всегда воспроизводить» или при первом просмотре',
      manualSkip: 'Показывать «Пропустить» при воспроизведении',
      countdown: 'Обратный отсчёт (за {seconds} с)',
      countdownFrom: 'Обратный отсчёт (начинается за {seconds} с)',
      timeline: 'Показывать участки на шкале', shortcutHint: 'Ctrl+← / Ctrl+→ — переход между главами',
      shortcut: 'Горячие клавиши глав',
      badgeHint: 'Ищет и показывает участки для пропуска. Выключение останавливает поиск.',
      badge: 'Показывать значки пропуска', commonDisplay: 'Общие настройки',
      advanced: 'Расширенные настройки', countdownStart: 'Начало отсчёта', undoDuration: 'Показ отмены',
      menuMovement: 'Анимация меню', actionDuration: 'Показ действия', secondsUnit: 'с',
      restoreDefaults: 'Восстановить по умолчанию', settingsData: 'Данные настроек',
      backupHelp: 'Перенос общих, сезонных, сериальных и расширенных настроек, истории и позиции в JSON.',
      export: 'Экспорт', exportTitle: 'Сохранить текущие настройки в JSON', import: 'Импорт',
      importTitle: 'Восстановить настройки из JSON', exported: 'Настройки экспортированы',
      exportFailed: 'Ошибка экспорта', importConfirm: 'Заменить текущие настройки и историю выбранной копией?',
      importCancelled: 'Импорт отменён', imported: 'Импорт завершён. Перезагрузка…',
      importFailed: 'Не удалось импортировать: {message}', invalidFormat: 'Неверный формат',
      detectedRanges: 'Обнаружено: {times}', seasonNumber: 'Сезон {number}', currentScope: 'Текущее: {name}',
      firstHistory: 'История первого просмотра', done: 'да', notYet: 'нет', pausedFeedback: 'AutoSkip приостановлен',
      resumedFeedback: 'AutoSkip возобновлён', dragNote: 'Вкладку справа можно перетаскивать',
      cancelThisSkip: 'Отменить этот автопропуск', cancelThisSkipHint: 'Нажмите, чтобы отменить автопропуск',
      syncBack: '‹ Синхронизация', syncDrawerAria: 'Синхронизация Emby', waitingPlayback: 'Ожидание', cancelled: 'Отменено',
      undoSkip: 'Отменить пропуск', skipSection: 'Пропустить этот участок', undoHint: 'Вернуться к началу пропущенного',
      skipHint: 'Нажмите, чтобы пропустить', undo: '↶ Вернуть', skip: 'Пропустить', remaining: 'Осталось {time}',
      waiting: 'Ожидание воспроизведения', paused: 'Пауза', available: 'Пропуск доступен · цель найдена',
      unavailable: 'Пропуск недоступен · цель не найдена', handleStatusAria: 'AutoSkip {status}. Нажмите для настроек; перетаскивайте по вертикали',
      handleStatusTitle: 'AutoSkip {status} / Нажатие: настройки / Перетаскивание: переместить', chapter: 'Глава', chapterNumber: 'Глава {number}',
      beginning: 'Начало', skipTarget: 'Есть участок для пропуска', allSkipTargets: 'Во всех сериях есть участки для пропуска',
      someSkipTargets: 'В некоторых сериях есть участки для пропуска', incompatibleLanguagePlugin: 'Языковой плагин несовместим'
    },

    it: {
      cancel: 'Annulla', auto: 'Automatico (browser)', language: 'Lingua di visualizzazione', languagePluginHint: 'Aggiungi il plugin delle lingue per abilitare la visualizzazione multilingue',
      handleAria: 'Impostazioni AutoSkip. Fai clic per aprire; trascina verticalmente per spostare', handleTitle: 'Clic: impostazioni / Trascina verticalmente: sposta', drawerAria: 'Impostazioni Emby AutoSkip', title: '⏭ AutoSkip',
      syncUnavailable: 'La sincronizzazione delle impostazioni non è disponibile', syncLoadFailed: 'Impossibile caricare il plugin di sincronizzazione. AutoSkip resta disponibile.', suspend: 'Metti in pausa AutoSkip', global: 'Globale', thisSeries: 'Questa serie', thisSeason: 'Questa stagione', useGlobal: 'Usa impostazioni globali',
      skipSettings: 'Impostazioni salto', intro: 'Introduzione / riepilogo precedente', op: 'Sigla iniziale (OP)', outro: 'Sigla finale (ED)', alwaysPlay: 'Riproduci sempre', firstOnly: 'Riproduci solo la prima volta', alwaysSkip: 'Salta sempre', resetHistory: 'Reimposta cronologia',
      manualSkipHint: 'Mostrato per i segmenti OP/ED impostati su Riproduci sempre o alla prima riproduzione', manualSkip: 'Mostra “Salta” durante la riproduzione', countdown: 'Conto alla rovescia (avviso da {seconds} s)', countdownFrom: 'Conto alla rovescia (inizia {seconds} s prima)', timeline: 'Mostra segmenti sulla barra di ricerca', shortcutHint: 'Usa Ctrl+← / Ctrl+→ per spostarti tra i capitoli', shortcut: 'Scorciatoie capitoli',
      badgeHint: 'Trova e mostra i segmenti da saltare. Disattivando si interrompe anche la scansione.', badge: 'Mostra badge dei segmenti da saltare', commonDisplay: 'Impostazioni comuni', advanced: 'Impostazioni avanzate', countdownStart: 'Inizio avviso', undoDuration: 'Durata Annulla', menuMovement: 'Movimento menu', actionDuration: 'Durata azione', secondsUnit: 's', restoreDefaults: 'Ripristina predefiniti',
      settingsData: 'Dati impostazioni', backupHelp: 'Trasferisci come JSON impostazioni globali, di stagione, serie e avanzate, cronologia e posizione della scheda.', export: 'Esporta', exportTitle: 'Salva le impostazioni correnti in un file JSON', import: 'Importa', importTitle: 'Ripristina le impostazioni da un file JSON', exported: 'Impostazioni esportate', exportFailed: 'Esportazione non riuscita', importConfirm: 'Sostituire impostazioni correnti, impostazioni stagione/serie e cronologia con il backup selezionato?',
      importCancelled: 'Importazione annullata', imported: 'Importato. Ricaricamento della pagina…', importFailed: 'Impossibile importare: {message}', invalidFormat: 'Formato non valido', detectedRanges: 'Segmenti rilevati: {times}', seasonNumber: 'Stagione {number}', currentScope: 'Attuale: {name}', firstHistory: 'Cronologia prima riproduzione', done: 'fatto', notYet: 'non ancora',
      pausedFeedback: 'AutoSkip in pausa', resumedFeedback: 'AutoSkip ripreso', dragNote: 'La scheda a destra può essere trascinata verticalmente', cancelThisSkip: 'Annulla questo salto automatico', cancelThisSkipHint: 'Fai clic per annullare questo salto automatico', syncBack: '‹ Sincronizzazione', syncDrawerAria: 'Sincronizzazione impostazioni Emby', waitingPlayback: 'In attesa', cancelled: 'Annullato', undoSkip: 'Annulla salto', skipSection: 'Salta questo segmento',
      undoHint: 'Fai clic per tornare all’inizio del segmento saltato', skipHint: 'Fai clic per saltare questo segmento', undo: '↶ Annulla', skip: 'Salta', remaining: '{time} rimanenti', waiting: 'In attesa della riproduzione', paused: 'In pausa', available: 'Salto disponibile · segmento rilevato', unavailable: 'Salto non disponibile · nessun segmento rilevato', handleStatusAria: 'AutoSkip {status}. Fai clic per le impostazioni; trascina verticalmente per spostare',
      handleStatusTitle: 'AutoSkip {status} / Clic: impostazioni / Trascina verticalmente: sposta', chapter: 'Capitolo', chapterNumber: 'Capitolo {number}', beginning: 'Inizio', skipTarget: 'Segmento da saltare', allSkipTargets: 'Tutti gli episodi hanno segmenti da saltare', someSkipTargets: 'Alcuni episodi hanno segmenti da saltare', incompatibleLanguagePlugin: 'Il plugin delle lingue non è compatibile'
    },

    fr: {
      cancel: 'Annuler', auto: 'Automatique (navigateur)', language: 'Langue d’affichage', languagePluginHint: 'Ajoutez le module de langues pour activer l’affichage multilingue',
      handleAria: 'Paramètres AutoSkip. Cliquez pour ouvrir ; faites glisser verticalement pour déplacer', handleTitle: 'Clic : paramètres / Glisser verticalement : déplacer', drawerAria: 'Paramètres Emby AutoSkip', title: '⏭ AutoSkip',
      syncUnavailable: 'La synchronisation des paramètres est indisponible', syncLoadFailed: 'Le module de synchronisation n’a pas pu être chargé. AutoSkip reste disponible.', suspend: 'Mettre AutoSkip en pause', global: 'Global', thisSeries: 'Cette série', thisSeason: 'Cette saison', useGlobal: 'Utiliser les paramètres globaux',
      skipSettings: 'Paramètres de saut', intro: 'Introduction / résumé précédent', op: 'Générique de début (OP)', outro: 'Générique de fin (ED)', alwaysPlay: 'Toujours lire', firstOnly: 'Lire uniquement la première fois', alwaysSkip: 'Toujours sauter', resetHistory: 'Réinitialiser l’historique',
      manualSkipHint: 'Affiché pour les segments OP/ED toujours lus ou lors de leur première lecture', manualSkip: 'Afficher « Sauter » pendant la lecture', countdown: 'Compte à rebours (aperçu à {seconds} s)', countdownFrom: 'Compte à rebours (débute {seconds} s avant)', timeline: 'Afficher les segments sur la barre de lecture', shortcutHint: 'Utilisez Ctrl+← / Ctrl+→ pour changer de chapitre', shortcut: 'Raccourcis de chapitre',
      badgeHint: 'Recherche et affiche les segments à sauter. La désactivation arrête aussi l’analyse.', badge: 'Afficher les badges de saut', commonDisplay: 'Paramètres communs', advanced: 'Paramètres avancés', countdownStart: 'Début de l’aperçu', undoDuration: 'Affichage Annuler', menuMovement: 'Mouvement du menu', actionDuration: 'Affichage de l’action', secondsUnit: 's', restoreDefaults: 'Valeurs par défaut',
      settingsData: 'Données des paramètres', backupHelp: 'Transférez en JSON les paramètres globaux, de saison, de série et avancés, l’historique et la position de l’onglet.', export: 'Exporter', exportTitle: 'Enregistrer les paramètres actuels dans un fichier JSON', import: 'Importer', importTitle: 'Restaurer les paramètres depuis un fichier JSON', exported: 'Paramètres exportés', exportFailed: 'Échec de l’exportation', importConfirm: 'Remplacer les paramètres actuels, ceux de saison/série et l’historique par la sauvegarde sélectionnée ?',
      importCancelled: 'Importation annulée', imported: 'Importé. Rechargement de la page…', importFailed: 'Importation impossible : {message}', invalidFormat: 'Format invalide', detectedRanges: 'Segments détectés : {times}', seasonNumber: 'Saison {number}', currentScope: 'Actuel : {name}', firstHistory: 'Historique de première lecture', done: 'fait', notYet: 'pas encore',
      pausedFeedback: 'AutoSkip en pause', resumedFeedback: 'AutoSkip repris', dragNote: 'L’onglet droit peut être déplacé verticalement', cancelThisSkip: 'Annuler ce saut automatique', cancelThisSkipHint: 'Cliquez pour annuler ce saut automatique', syncBack: '‹ Synchronisation', syncDrawerAria: 'Synchronisation des paramètres Emby', waitingPlayback: 'En attente', cancelled: 'Annulé', undoSkip: 'Annuler le saut', skipSection: 'Sauter ce segment',
      undoHint: 'Cliquez pour revenir au début du segment sauté', skipHint: 'Cliquez pour sauter ce segment', undo: '↶ Annuler', skip: 'Sauter', remaining: '{time} restantes', waiting: 'En attente de lecture', paused: 'En pause', available: 'Saut disponible · cible détectée', unavailable: 'Saut indisponible · aucune cible détectée', handleStatusAria: 'AutoSkip {status}. Cliquez pour les paramètres ; faites glisser verticalement pour déplacer',
      handleStatusTitle: 'AutoSkip {status} / Clic : paramètres / Glisser verticalement : déplacer', chapter: 'Chapitre', chapterNumber: 'Chapitre {number}', beginning: 'Début', skipTarget: 'Cible de saut', allSkipTargets: 'Tous les épisodes ont des cibles de saut', someSkipTargets: 'Certains épisodes ont des cibles de saut', incompatibleLanguagePlugin: 'Le module de langues est incompatible'
    },

    de: {
      cancel: 'Abbrechen', auto: 'Automatisch (Browser)', language: 'Anzeigesprache', languagePluginHint: 'Sprach-Plugin hinzufügen, um die mehrsprachige Anzeige zu aktivieren',
      handleAria: 'AutoSkip-Einstellungen. Zum Öffnen klicken; zum Verschieben vertikal ziehen', handleTitle: 'Klick: Einstellungen / Vertikal ziehen: verschieben', drawerAria: 'Emby AutoSkip-Einstellungen', title: '⏭ AutoSkip',
      syncUnavailable: 'Einstellungssynchronisierung ist nicht verfügbar', syncLoadFailed: 'Das Synchronisierungs-Plugin konnte nicht geladen werden. AutoSkip bleibt verfügbar.', suspend: 'AutoSkip pausieren', global: 'Global', thisSeries: 'Diese Serie', thisSeason: 'Diese Staffel', useGlobal: 'Globale Einstellungen verwenden',
      skipSettings: 'Überspringen-Einstellungen', intro: 'Intro / bisherige Handlung', op: 'Vorspann (OP)', outro: 'Abspann (ED)', alwaysPlay: 'Immer abspielen', firstOnly: 'Nur beim ersten Mal abspielen', alwaysSkip: 'Immer überspringen', resetHistory: 'Verlauf zurücksetzen',
      manualSkipHint: 'Wird für OP/ED-Abschnitte angezeigt, die immer oder zum ersten Mal abgespielt werden', manualSkip: '„Überspringen“ bei Wiedergabe anzeigen', countdown: 'Countdown (Vorschau ab {seconds} s)', countdownFrom: 'Countdown (beginnt {seconds} s vorher)', timeline: 'Abschnitte auf der Suchleiste anzeigen', shortcutHint: 'Mit Ctrl+← / Ctrl+→ zwischen Kapiteln wechseln', shortcut: 'Kapitel-Tastenkürzel',
      badgeHint: 'Sucht und zeigt überspringbare Abschnitte. Ausschalten beendet auch die Suche.', badge: 'Badges für überspringbare Abschnitte anzeigen', commonDisplay: 'Allgemeine Einstellungen', advanced: 'Erweiterte Einstellungen', countdownStart: 'Vorschauzeit', undoDuration: 'Rückgängig-Anzeige', menuMovement: 'Menübewegung', actionDuration: 'Aktionsanzeige', secondsUnit: 's', restoreDefaults: 'Standardwerte',
      settingsData: 'Einstellungsdaten', backupHelp: 'Globale, Staffel-, Serien- und erweiterte Einstellungen, Verlauf und Tabposition als JSON übertragen.', export: 'Exportieren', exportTitle: 'Aktuelle Einstellungen als JSON speichern', import: 'Importieren', importTitle: 'Einstellungen aus JSON wiederherstellen', exported: 'Einstellungen exportiert', exportFailed: 'Export fehlgeschlagen', importConfirm: 'Aktuelle Einstellungen, Staffel-/Serieneinstellungen und Verlauf durch die gewählte Sicherung ersetzen?',
      importCancelled: 'Import abgebrochen', imported: 'Importiert. Seite wird neu geladen…', importFailed: 'Import nicht möglich: {message}', invalidFormat: 'Ungültiges Format', detectedRanges: 'Erkannte Abschnitte: {times}', seasonNumber: 'Staffel {number}', currentScope: 'Aktuell: {name}', firstHistory: 'Erstwiedergabe-Verlauf', done: 'fertig', notYet: 'noch nicht',
      pausedFeedback: 'AutoSkip pausiert', resumedFeedback: 'AutoSkip fortgesetzt', dragNote: 'Der rechte Tab kann vertikal gezogen werden', cancelThisSkip: 'Dieses automatische Überspringen abbrechen', cancelThisSkipHint: 'Klicken, um dieses automatische Überspringen abzubrechen', syncBack: '‹ Synchronisierung', syncDrawerAria: 'Emby-Einstellungssynchronisierung', waitingPlayback: 'Warten', cancelled: 'Abgebrochen', undoSkip: 'Überspringen rückgängig', skipSection: 'Diesen Abschnitt überspringen',
      undoHint: 'Zum Anfang des übersprungenen Abschnitts zurückkehren', skipHint: 'Klicken, um diesen Abschnitt zu überspringen', undo: '↶ Zurück', skip: 'Überspringen', remaining: 'Noch {time}', waiting: 'Warten auf Wiedergabe', paused: 'Pausiert', available: 'Überspringen verfügbar · Ziel erkannt', unavailable: 'Überspringen nicht verfügbar · kein Ziel erkannt', handleStatusAria: 'AutoSkip {status}. Für Einstellungen klicken; zum Verschieben vertikal ziehen',
      handleStatusTitle: 'AutoSkip {status} / Klick: Einstellungen / Vertikal ziehen: verschieben', chapter: 'Kapitel', chapterNumber: 'Kapitel {number}', beginning: 'Anfang', skipTarget: 'Überspringbares Ziel', allSkipTargets: 'Alle Folgen haben überspringbare Abschnitte', someSkipTargets: 'Einige Folgen haben überspringbare Abschnitte', incompatibleLanguagePlugin: 'Das Sprach-Plugin ist inkompatibel'
    },

    pl: {
      cancel: 'Anuluj', auto: 'Automatycznie (przeglądarka)', language: 'Język interfejsu', languagePluginHint: 'Dodaj wtyczkę językową, aby włączyć interfejs wielojęzyczny',
      handleAria: 'Ustawienia AutoSkip. Kliknij, aby otworzyć; przeciągnij pionowo, aby przesunąć', handleTitle: 'Kliknięcie: ustawienia / Przeciąganie pionowe: przesuń', drawerAria: 'Ustawienia Emby AutoSkip', title: '⏭ AutoSkip',
      syncUnavailable: 'Synchronizacja ustawień jest niedostępna', syncLoadFailed: 'Nie udało się wczytać wtyczki synchronizacji. AutoSkip nadal działa.', suspend: 'Wstrzymaj AutoSkip', global: 'Globalne', thisSeries: 'Ten serial', thisSeason: 'Ten sezon', useGlobal: 'Użyj ustawień globalnych',
      skipSettings: 'Ustawienia pomijania', intro: 'Intro / poprzednio', op: 'Czołówka (OP)', outro: 'Napisy końcowe (ED)', alwaysPlay: 'Zawsze odtwarzaj', firstOnly: 'Odtwarzaj tylko pierwszy raz', alwaysSkip: 'Zawsze pomijaj', resetHistory: 'Wyczyść historię',
      manualSkipHint: 'Pokazywane dla sekcji OP/ED odtwarzanych zawsze lub po raz pierwszy', manualSkip: 'Pokaż „Pomiń” podczas odtwarzania', countdown: 'Odliczanie (zapowiedź od {seconds} s)', countdownFrom: 'Odliczanie (zaczyna się {seconds} s wcześniej)', timeline: 'Pokaż sekcje na pasku przewijania', shortcutHint: 'Ctrl+← / Ctrl+→ przełącza między rozdziałami', shortcut: 'Skróty rozdziałów',
      badgeHint: 'Wyszukuje i pokazuje sekcje do pominięcia. Wyłączenie zatrzymuje też skanowanie.', badge: 'Pokaż oznaczenia pomijania', commonDisplay: 'Ustawienia wspólne', advanced: 'Ustawienia zaawansowane', countdownStart: 'Początek zapowiedzi', undoDuration: 'Czas cofnięcia', menuMovement: 'Ruch menu', actionDuration: 'Czas akcji', secondsUnit: 's', restoreDefaults: 'Przywróć domyślne',
      settingsData: 'Dane ustawień', backupHelp: 'Przenieś jako JSON ustawienia globalne, sezonu, serialu i zaawansowane, historię oraz pozycję karty.', export: 'Eksportuj', exportTitle: 'Zapisz bieżące ustawienia do pliku JSON', import: 'Importuj', importTitle: 'Przywróć ustawienia z pliku JSON', exported: 'Ustawienia wyeksportowano', exportFailed: 'Eksport nie powiódł się', importConfirm: 'Zastąpić bieżące ustawienia, ustawienia sezonu/serialu i historię wybraną kopią?',
      importCancelled: 'Import anulowany', imported: 'Zaimportowano. Ponowne wczytywanie strony…', importFailed: 'Nie można zaimportować: {message}', invalidFormat: 'Nieprawidłowy format', detectedRanges: 'Wykryte sekcje: {times}', seasonNumber: 'Sezon {number}', currentScope: 'Bieżące: {name}', firstHistory: 'Historia pierwszego odtworzenia', done: 'tak', notYet: 'nie',
      pausedFeedback: 'AutoSkip wstrzymany', resumedFeedback: 'AutoSkip wznowiony', dragNote: 'Kartę po prawej można przeciągać pionowo', cancelThisSkip: 'Anuluj to automatyczne pominięcie', cancelThisSkipHint: 'Kliknij, aby anulować to automatyczne pominięcie', syncBack: '‹ Synchronizacja', syncDrawerAria: 'Synchronizacja ustawień Emby', waitingPlayback: 'Oczekiwanie', cancelled: 'Anulowano', undoSkip: 'Cofnij pominięcie', skipSection: 'Pomiń tę sekcję',
      undoHint: 'Kliknij, aby wrócić na początek pominiętej sekcji', skipHint: 'Kliknij, aby pominąć tę sekcję', undo: '↶ Cofnij', skip: 'Pomiń', remaining: 'Pozostało {time}', waiting: 'Oczekiwanie na odtwarzanie', paused: 'Wstrzymano', available: 'Pomijanie dostępne · wykryto cel', unavailable: 'Pomijanie niedostępne · brak celu', handleStatusAria: 'AutoSkip {status}. Kliknij ustawienia; przeciągnij pionowo, aby przesunąć',
      handleStatusTitle: 'AutoSkip {status} / Kliknięcie: ustawienia / Przeciąganie pionowe: przesuń', chapter: 'Rozdział', chapterNumber: 'Rozdział {number}', beginning: 'Początek', skipTarget: 'Cel pomijania', allSkipTargets: 'Wszystkie odcinki mają sekcje do pominięcia', someSkipTargets: 'Niektóre odcinki mają sekcje do pominięcia', incompatibleLanguagePlugin: 'Wtyczka językowa jest niezgodna'
    },

    uk: {
      cancel: 'Скасувати', auto: 'Автоматично (браузер)', language: 'Мова інтерфейсу',
      languagePluginHint: 'Додайте мовний плагін для багатомовного інтерфейсу',
      handleAria: 'Налаштування AutoSkip. Натисніть, щоб відкрити; перетягуйте вертикально',
      handleTitle: 'Клік: налаштування / Вертикальне перетягування: перемістити', drawerAria: 'Налаштування Emby AutoSkip', title: '⏭ AutoSkip',
      syncUnavailable: 'Синхронізація налаштувань недоступна', syncLoadFailed: 'Не вдалося завантажити плагін синхронізації. AutoSkip продовжує працювати.',
      suspend: 'Призупинити AutoSkip', global: 'Загальні', thisSeries: 'Цей серіал', thisSeason: 'Цей сезон',
      useGlobal: 'Використовувати загальні налаштування', skipSettings: 'Налаштування пропуску', intro: 'Вступ / раніше в серіалі',
      op: 'Початкова заставка (OP)', outro: 'Кінцева заставка (ED)', alwaysPlay: 'Завжди відтворювати', firstOnly: 'Лише вперше',
      alwaysSkip: 'Завжди пропускати', resetHistory: 'Скинути історію', manualSkipHint: 'Показується для OP/ED з постійним або першим відтворенням',
      manualSkip: 'Показувати «Пропустити» під час відтворення', countdown: 'Відлік (за {seconds} с)', countdownFrom: 'Відлік (початок за {seconds} с)',
      timeline: 'Показувати ділянки на шкалі', shortcutHint: 'Ctrl+← / Ctrl+→ — перехід між розділами', shortcut: 'Гарячі клавіші розділів',
      badgeHint: 'Знаходить і показує цілі пропуску. Вимкнення також зупиняє пошук.', badge: 'Показувати позначки пропуску', commonDisplay: 'Загальні налаштування',
      advanced: 'Розширені налаштування', countdownStart: 'Початок відліку', undoDuration: 'Показ скасування', menuMovement: 'Рух меню', actionDuration: 'Показ дії', secondsUnit: 'с',
      restoreDefaults: 'Відновити типові', settingsData: 'Дані налаштувань', backupHelp: 'Перенесення загальних, сезонних, серіальних і розширених налаштувань, історії та позиції у JSON.',
      export: 'Експорт', exportTitle: 'Зберегти поточні налаштування у JSON', import: 'Імпорт', importTitle: 'Відновити налаштування з JSON',
      exported: 'Налаштування експортовано', exportFailed: 'Помилка експорту', importConfirm: 'Замінити поточні налаштування та історію вибраною копією?',
      importCancelled: 'Імпорт скасовано', imported: 'Імпортовано. Перезавантаження…', importFailed: 'Не вдалося імпортувати: {message}', invalidFormat: 'Неправильний формат',
      detectedRanges: 'Виявлені ділянки: {times}', seasonNumber: 'Сезон {number}', currentScope: 'Поточне: {name}', firstHistory: 'Історія першого перегляду', done: 'так', notYet: 'ні',
      pausedFeedback: 'AutoSkip призупинено', resumedFeedback: 'AutoSkip відновлено', dragNote: 'Праву вкладку можна перетягувати', cancelThisSkip: 'Скасувати цей автопропуск',
      cancelThisSkipHint: 'Натисніть, щоб скасувати автопропуск', syncBack: '‹ Синхронізація', syncDrawerAria: 'Синхронізація Emby', waitingPlayback: 'Очікування',
      cancelled: 'Скасовано', undoSkip: 'Скасувати пропуск', skipSection: 'Пропустити цю ділянку', undoHint: 'Повернутися до початку пропущеної ділянки',
      skipHint: 'Натисніть, щоб пропустити', undo: '↶ Повернути', skip: 'Пропустити', remaining: 'Залишилося {time}', waiting: 'Очікування відтворення', paused: 'Пауза',
      available: 'Пропуск доступний · ціль виявлено', unavailable: 'Пропуск недоступний · ціль не виявлено', handleStatusAria: 'AutoSkip {status}. Натисніть для налаштувань; перетягуйте вертикально',
      handleStatusTitle: 'AutoSkip {status} / Клік: налаштування / Перетягування: перемістити', chapter: 'Розділ', chapterNumber: 'Розділ {number}', beginning: 'Початок',
      skipTarget: 'Ціль пропуску', allSkipTargets: 'Усі епізоди мають цілі пропуску', someSkipTargets: 'Деякі епізоди мають цілі пропуску', incompatibleLanguagePlugin: 'Мовний плагін несумісний'
    }
  };

  const names = {
    en: 'English', ru: 'Русский', es: 'Español', pt: 'Português',
    it: 'Italiano', fr: 'Français', de: 'Deutsch', pl: 'Polski',
    uk: 'Українська'
  };
  const languageOrder = ['en', 'ru', 'es', 'pt', 'it', 'fr', 'de', 'pl', 'uk'];
  const plugin = Object.freeze({
    version: '1.0.0',
    apiVersion: API_VERSION,
    languages: languageOrder.map(code => ({
      code,
      name: names[code],
      messages: translations[code]
    }))
  });
  let registered = false;

  function register() {
    if (registered) return;
    const core = window.EmbyAutoSkip;
    if (typeof core?.registerLanguagePlugin !== 'function') return;
    registered = core.registerLanguagePlugin(plugin) === true;
  }

  window.EmbyAutoSkipLanguagePlugin = plugin;
  register();
  window.addEventListener('emby-autoskip:ready', register);
})();
