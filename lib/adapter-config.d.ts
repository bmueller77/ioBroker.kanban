// Typen der Instanz-Konfiguration. Die Felder stammen aus dem Abschnitt
// "native" in io-package.json. Ohne diese Datei kennt die Typprüfung
// adapter.config.<feld> nicht und meldet jeden Zugriff als Fehler.
//
// Beim Ergänzen eines Feldes in io-package.json hier mitziehen.

declare global {
    namespace ioBroker {
        interface AdapterConfig {
            port: number;
            bind: string;
            dateFormat: string;
            timeFormat: string;
            users: any[];
            inboundTokens: any[];
            outboundWebhooks: any[];
            emailInstance: string;
            emailFrom: string;
            notifyAssigned: boolean;
            notifyDue: boolean;
            notifyCreated: boolean;
            notifyMoved: boolean;
            notifyDone: boolean;
            notifyDeleted: boolean;
            notifyRestored: boolean;
            notifyPurged: boolean;
            reminderTime: string;
            reminderDaysBefore: number;
            dueExact: boolean;
            publicUrl: string;
            themeDefault: string;
            accentColor: string;
            customCss: string;
            language: string;
            notifyUpdated: boolean;
            apiWriteProtection: boolean;
            actionStateEnabled: boolean;
            corsOrigins: string;
        }
    }
}

// erzwingt, dass die Datei als Modul gilt
export {};
