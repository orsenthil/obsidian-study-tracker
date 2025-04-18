// main.ts
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

interface StudyTrackerSettings {
    studyData: { [key: string]: number };
}

const DEFAULT_SETTINGS: StudyTrackerSettings = {
    studyData: {}
}

export default class StudyTrackerPlugin extends Plugin {
    settings: StudyTrackerSettings;

    async onload() {
        await this.loadSettings();

        // Add a ribbon icon to increment the study count
        this.addRibbonIcon('checkbox-glyph', 'Record Study Session', async () => {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile) {
                await this.incrementStudyCount(activeFile);
            } else {
                new Notice('No active file to record study session for');
            }
        });

        // Add a command to increment the study count
        this.addCommand({
            id: 'increment-study-count',
            name: 'Record Study Session',
            editorCallback: async (editor: Editor, view: MarkdownView) => {
                const file = view.file;
                if (file) {
                    await this.incrementStudyCount(file);
                }
            }
        });

        // Add a command to display the current study count
        this.addCommand({
            id: 'show-study-count',
            name: 'Show Study Count',
            editorCallback: async (editor: Editor, view: MarkdownView) => {
                const file = view.file;
                if (file) {
                    const count = this.getStudyCount(file);
                    new Notice(`Study count for "${file.name}": ${count}`);
                }
            }
        });

        // Add a status bar item to show the current study count
        const statusBarItem = this.addStatusBarItem();
        statusBarItem.setText('Studied: 0');

        // Update status bar when file changes
        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                if (file) {
                    const count = this.getStudyCount(file);
                    statusBarItem.setText(`Studied: ${count}`);
                } else {
                    statusBarItem.setText('Studied: -');
                }
            })
        );

        // Add settings tab
        this.addSettingTab(new StudyTrackerSettingTab(this.app, this));
    }

    onunload() {
        // Nothing special to clean up
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // Get the study count for a file
    getStudyCount(file: TFile): number {
        const filePath = file.path;
        return this.settings.studyData[filePath] || 0;
    }

    // Increment the study count for a file
    async incrementStudyCount(file: TFile) {
        const filePath = file.path;
        const currentCount = this.getStudyCount(file);
        this.settings.studyData[filePath] = currentCount + 1;
        await this.saveSettings();
        
        new Notice(`Study count for "${file.name}" increased to ${currentCount + 1}`);
        
        // Update the status bar
        // We need to re-find the status bar item rather than using statusBarEl
        const statusBarItems = document.getElementsByClassName('status-bar-item');
        for (let i = 0; i < statusBarItems.length; i++) {
            const item = statusBarItems[i];
            if (item.textContent && item.textContent.startsWith('Studied:')) {
                item.textContent = `Studied: ${currentCount + 1}`;
                break;
            }
        }

        // Optionally, you can update the file content with the new count
        await this.updateFileContent(file, currentCount + 1);
    }

    // Update the file content with the study count
    async updateFileContent(file: TFile, count: number) {
        try {
            // Read the current file content
            const content = await this.app.vault.read(file);
            
            // Check if the file already has a study counter
            const studyCountRegex = /^---\s*[\s\S]*study_count:\s*\d+[\s\S]*---/;
            const frontmatterRegex = /^---\s*([\s\S]*?)\s*---/;
            
            let newContent;
            
            if (studyCountRegex.test(content)) {
                // Update existing study counter
                newContent = content.replace(/study_count:\s*\d+/, `study_count: ${count}`);
            } else if (frontmatterRegex.test(content)) {
                // Add study counter to existing frontmatter
                newContent = content.replace(/^---\s*([\s\S]*?)\s*---/, `---\n$1study_count: ${count}\n---`);
            } else {
                // Add new frontmatter with study counter
                newContent = `---\nstudy_count: ${count}\n---\n\n${content}`;
            }
            
            // Write the updated content back to the file
            await this.app.vault.modify(file, newContent);
            
        } catch (error) {
            console.error("Error updating file content:", error);
            new Notice("Failed to update file content with mastery count");
        }
    }
}

// Settings Tab for the plugin
class StudyTrackerSettingTab extends PluginSettingTab {
    plugin: StudyTrackerPlugin;

    constructor(app: App, plugin: StudyTrackerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();

        containerEl.createEl('h2', {text: 'Study Tracker Settings'});

        new Setting(containerEl)
            .setName('Reset All Study Counters')
            .setDesc('This will reset all study session counters to zero')
            .addButton(button => button
                .setButtonText('Reset')
                .onClick(async () => {
                    this.plugin.settings.studyData = {};
                    await this.plugin.saveSettings();
                    new Notice('All study counters have been reset');
                }));

        // Add a table showing all study counts
        containerEl.createEl('h3', {text: 'Current Study Counts'});
        const studyData = this.plugin.settings.studyData;
        
        if (Object.keys(studyData).length === 0) {
            containerEl.createEl('p', {text: 'No study data recorded yet'});
        } else {
            const table = containerEl.createEl('table');
            const headerRow = table.createEl('tr');
            headerRow.createEl('th', {text: 'File'});
            headerRow.createEl('th', {text: 'Times Studied'});
            headerRow.createEl('th', {text: 'Actions'});
            
            for (const filePath in studyData) {
                const count = studyData[filePath];
                const row = table.createEl('tr');
                row.createEl('td', {text: filePath});
                row.createEl('td', {text: count.toString()});
                
                const actionsCell = row.createEl('td');
                const resetButton = actionsCell.createEl('button', {text: 'Reset'});
                resetButton.addEventListener('click', async () => {
                    delete this.plugin.settings.studyData[filePath];
                    await this.plugin.saveSettings();
                    this.display(); // Refresh the display
                });
            }
        }
    }
}
