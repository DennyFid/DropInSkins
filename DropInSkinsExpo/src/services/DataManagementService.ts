import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Platform, Alert } from 'react-native';
import { DatabaseService } from '../data/database';

const { StorageAccessFramework } = FileSystem;
const BACKUP_DIR_KEY = 'backup_directory_uri';

export const DataManagementService = {
    async getBackupDirectory() {
        return await DatabaseService.getSetting(BACKUP_DIR_KEY);
    },

    async selectBackupDirectory() {
        try {
            const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
            if (permissions.granted) {
                await DatabaseService.setSetting(BACKUP_DIR_KEY, permissions.directoryUri);
                return permissions.directoryUri;
            }
            return null;
        } catch (error) {
            console.error("[DataManagement] Error selecting directory:", error);
            return null;
        }
    },

    async backupData() {
        try {
            const data = await DatabaseService.exportData();
            const dateStr = new Date().toISOString().split('T')[0];
            const fileName = `DropInSkins_Backup_${dateStr}.json`;

            if (Platform.OS === 'web') {
                const blob = new Blob([data], { type: 'application/json' });
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', fileName);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
                return true;
            } else if (Platform.OS === 'android') {
                let dirUri = await this.getBackupDirectory();

                if (!dirUri) {
                    dirUri = await this.selectBackupDirectory();
                }

                if (dirUri) {
                    try {
                        const fileExists = await StorageAccessFramework.readDirectoryAsync(dirUri)
                            .then(files => files.find(f => f.endsWith(fileName)))
                            .catch(() => null);

                        if (fileExists) {
                            // If it exists, maybe we just overwrite or delete first? 
                            // For simplicity, we'll try to create a new one with timestamp if needed, 
                            // but here we just try to create. SAF usually appends (1) if exists.
                        }

                        const fileUri = await StorageAccessFramework.createFileAsync(dirUri, fileName, 'application/json');
                        await FileSystem.writeAsStringAsync(fileUri, data, { encoding: FileSystem.EncodingType.UTF8 });
                        Alert.alert("Success", `Backup saved to selected folder as ${fileName}`);
                        return true;
                    } catch (e) {
                        // Fallback to sharing if directory fails (e.g. permission revoked)
                        console.warn("SAF write failed, falling back to share:", e);
                        return await this.fallbackShare(data, fileName);
                    }
                } else {
                    return await this.fallbackShare(data, fileName);
                }
            } else {
                // iOS / Fallback
                return await this.fallbackShare(data, fileName);
            }
        } catch (error: any) {
            console.error("[Backup] Error:", error);
            Alert.alert("Backup Failed", error?.message || "Unknown error");
            return false;
        }
    },

    async fallbackShare(data: string, fileName: string) {
        const baseDir = FileSystem.cacheDirectory;
        if (!baseDir) throw new Error("No writable directory found.");
        const fileUri = baseDir + fileName;
        await FileSystem.writeAsStringAsync(fileUri, data, { encoding: FileSystem.EncodingType.UTF8 });

        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri, {
                mimeType: 'application/json',
                dialogTitle: 'Save Backup File',
                UTI: 'public.json'
            });
            return true;
        }
        return false;
    },

    async getBackupFiles() {
        if (Platform.OS !== 'android') return null;
        const dirUri = await this.getBackupDirectory();
        if (!dirUri) return null;

        try {
            const files = await StorageAccessFramework.readDirectoryAsync(dirUri);
            return files.filter(f => f.toLowerCase().endsWith('.json'))
                .map(uri => ({
                    uri,
                    name: decodeURIComponent(uri.split('%2F').pop() || uri.split('/').pop() || 'backup.json')
                }))
                .sort((a, b) => b.name.localeCompare(a.name));
        } catch (e) {
            console.warn("Could not read directory:", e);
            return null;
        }
    },

    async restoreData(fileUri?: string) {
        try {
            let uri = fileUri;

            if (!uri) {
                if (Platform.OS === 'web') {
                    alert("Restore not yet fully supported on web.");
                    return false;
                }

                const result = await DocumentPicker.getDocumentAsync({
                    type: 'application/json',
                    copyToCacheDirectory: true
                });

                if (result.canceled) return false;
                uri = result.assets[0].uri;
            }

            const fileContent = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
            await DatabaseService.importData(fileContent);
            return true;
        } catch (error: any) {
            console.error("[Restore] Error:", error);
            Alert.alert("Restore Failed", error?.message || "Unknown error");
            return false;
        }
    }
};
