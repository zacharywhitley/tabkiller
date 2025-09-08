import browser from 'webextension-polyfill';

/**
 * Options page initialization and event handling
 */
class OptionsPage {
  private initialized = false;

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.setupEventListeners();
      await this.loadSettings();
      this.initialized = true;
      console.log('Options page initialized successfully');
    } catch (error) {
      console.error('Failed to initialize options page:', error);
    }
  }

  private async setupEventListeners(): Promise<void> {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      await new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', resolve);
      });
    }

    // Setup form submission handlers
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
      form.addEventListener('submit', this.handleFormSubmit.bind(this));
    });

    // Setup input change handlers for real-time validation
    const inputs = document.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      input.addEventListener('change', this.handleInputChange.bind(this));
    });

    // Setup reset button
    const resetButton = document.getElementById('reset-settings');
    if (resetButton) {
      resetButton.addEventListener('click', this.handleReset.bind(this));
    }
  }

  private async loadSettings(): Promise<void> {
    try {
      const settings = await browser.storage.sync.get();
      this.populateForm(settings);
    } catch (error) {
      console.error('Failed to load settings:', error);
      // Fallback to local storage
      try {
        const settings = await browser.storage.local.get();
        this.populateForm(settings);
      } catch (localError) {
        console.error('Failed to load from local storage:', localError);
      }
    }
  }

  private populateForm(settings: Record<string, any>): void {
    Object.entries(settings).forEach(([key, value]) => {
      const element = document.getElementById(key) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if (element) {
        if (element.type === 'checkbox') {
          (element as HTMLInputElement).checked = Boolean(value);
        } else if (element.type === 'radio') {
          const radioElement = document.querySelector(`input[name="${key}"][value="${value}"]`) as HTMLInputElement;
          if (radioElement) {
            radioElement.checked = true;
          }
        } else {
          element.value = String(value || '');
        }
      }
    });
  }

  private async handleFormSubmit(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    
    try {
      const formData = new FormData(form);
      const settings: Record<string, any> = {};
      
      for (const [key, value] of formData.entries()) {
        const element = form.elements.namedItem(key) as HTMLInputElement;
        if (element) {
          if (element.type === 'checkbox') {
            settings[key] = element.checked;
          } else if (element.type === 'number') {
            settings[key] = Number(value);
          } else {
            settings[key] = String(value);
          }
        }
      }

      await this.saveSettings(settings);
      this.showNotification('Settings saved successfully!', 'success');
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showNotification('Failed to save settings. Please try again.', 'error');
    }
  }

  private async handleInputChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const key = input.id || input.name;
    
    if (!key) return;

    try {
      let value: any = input.value;
      
      if (input.type === 'checkbox') {
        value = (input as HTMLInputElement).checked;
      } else if (input.type === 'number') {
        value = Number(input.value);
      }

      await this.saveSettings({ [key]: value });
      this.validateInput(input);
    } catch (error) {
      console.error('Failed to save setting:', error);
    }
  }

  private async handleReset(event: Event): Promise<void> {
    event.preventDefault();
    
    const confirmed = confirm('Are you sure you want to reset all settings to their default values? This action cannot be undone.');
    if (!confirmed) return;

    try {
      await browser.storage.sync.clear();
      await browser.storage.local.clear();
      
      // Reload the page to show default values
      window.location.reload();
    } catch (error) {
      console.error('Failed to reset settings:', error);
      this.showNotification('Failed to reset settings. Please try again.', 'error');
    }
  }

  private async saveSettings(settings: Record<string, any>): Promise<void> {
    try {
      await browser.storage.sync.set(settings);
    } catch (error) {
      console.error('Failed to save to sync storage:', error);
      // Fallback to local storage
      await browser.storage.local.set(settings);
    }
  }

  private validateInput(input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void {
    // Remove existing validation classes
    input.classList.remove('valid', 'invalid');
    
    // Basic validation
    if (input.required && !input.value.trim()) {
      input.classList.add('invalid');
      return;
    }

    if (input.type === 'email' && input.value) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(input.value)) {
        input.classList.add('invalid');
        return;
      }
    }

    if (input.type === 'number' && input.value) {
      const min = Number(input.getAttribute('min'));
      const max = Number(input.getAttribute('max'));
      const value = Number(input.value);
      
      if (!isNaN(min) && value < min) {
        input.classList.add('invalid');
        return;
      }
      
      if (!isNaN(max) && value > max) {
        input.classList.add('invalid');
        return;
      }
    }

    input.classList.add('valid');
  }

  private showNotification(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification--${type}`;
    notification.textContent = message;

    // Add to page
    document.body.appendChild(notification);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new OptionsPage();
  });
} else {
  new OptionsPage();
}

export default OptionsPage;