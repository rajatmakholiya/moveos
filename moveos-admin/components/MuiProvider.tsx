'use client';

import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import 'dayjs/locale/en';
dayjs.extend(localizedFormat);
dayjs.locale('en');

import { ThemeProvider, createTheme } from '@mui/material/styles';
import type {} from '@mui/x-data-grid/themeAugmentation';
import { LocalizationProvider } from '@mui/x-date-pickers';
import type {} from '@mui/x-date-pickers/themeAugmentation';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';

const theme = createTheme({
  palette: {
    primary: { main: '#2563eb' },
    text: { primary: '#0f172a', secondary: '#64748b' },
    background: { default: '#f8fafc', paper: '#ffffff' },
    divider: '#e2e8f0',
  },
  typography: {
    fontFamily: 'inherit',
    fontSize: 14,
  },
  shape: { borderRadius: 8 },
  components: {
    MuiDataGrid: {
      styleOverrides: {
        root: {
          border: 'none',
          backgroundColor: '#ffffff',
          fontSize: '0.875rem',
          fontFamily: 'inherit',
          '--DataGrid-rowBorderColor': '#f1f5f9',
          '--DataGrid-containerBackground': '#f8fafc',
        },
        columnHeader: {
          backgroundColor: '#f8fafc',
          color: '#64748b',
          fontSize: '0.7rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          '&:focus, &:focus-within': { outline: 'none' },
        },
        columnSeparator: { color: '#e2e8f0' },
        cell: {
          borderColor: '#f1f5f9',
          color: '#0f172a',
          alignItems: 'center',
          '&:focus, &:focus-within': { outline: 'none' },
        },
        row: {
          '&:hover': { backgroundColor: '#f8fafc', cursor: 'pointer' },
          '&.Mui-selected': { backgroundColor: '#eff6ff' },
          '&.Mui-selected:hover': { backgroundColor: '#dbeafe' },
        },
        footerContainer: {
          borderTop: '1px solid #e2e8f0',
          backgroundColor: '#f8fafc',
          minHeight: 48,
        },
        toolbarContainer: {
          padding: '8px 16px',
          borderBottom: '1px solid #f1f5f9',
          gap: 8,
        },
        overlay: { backgroundColor: '#f8fafc' },
      },
      defaultProps: {
        density: 'comfortable',
        disableRowSelectionOnClick: true,
        pageSizeOptions: [25, 50, 100],
        initialState: { pagination: { paginationModel: { pageSize: 25 } } },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: { fontFamily: 'inherit', fontSize: '0.875rem' },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#94a3b8' },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#2563eb' },
        },
      },
    },
    MuiPickersDay: {
      styleOverrides: {
        root: { fontFamily: 'inherit', fontSize: '0.875rem' },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { fontFamily: 'inherit', textTransform: 'none' },
      },
    },
  },
});

export default function MuiProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        {children}
      </LocalizationProvider>
    </ThemeProvider>
  );
}
