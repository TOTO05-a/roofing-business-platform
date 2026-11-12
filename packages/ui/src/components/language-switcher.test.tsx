import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LanguageSwitcher } from './language-switcher';

const options = [
  { code: 'es', name: 'Español' },
  { code: 'en', name: 'English' },
] as const;

describe('LanguageSwitcher', () => {
  it('agrupa los idiomas con nombre accesible y marca el activo', () => {
    render(<LanguageSwitcher options={options} value="es" onChange={() => {}} label="Idioma" />);
    expect(screen.getByRole('group', { name: 'Idioma' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Español' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('llama a onChange con el código al elegir otro idioma', async () => {
    const onChange = vi.fn();
    render(<LanguageSwitcher options={options} value="es" onChange={onChange} label="Idioma" />);
    await userEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(onChange).toHaveBeenCalledWith('en');
  });

  it('no llama a onChange al pulsar el idioma ya activo', async () => {
    const onChange = vi.fn();
    render(<LanguageSwitcher options={options} value="es" onChange={onChange} label="Idioma" />);
    await userEvent.click(screen.getByRole('button', { name: 'Español' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('declara el idioma de cada opción con lang', () => {
    render(<LanguageSwitcher options={options} value="es" onChange={() => {}} label="Idioma" />);
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('lang', 'en');
  });
});
