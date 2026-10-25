package com.travelatlas.places;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.travelatlas.security.CurrentUser;
import org.junit.jupiter.api.BeforeEach;
import static org.mockito.Mockito.lenient;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class PlaceServiceTest {
    @Mock private PlaceMapper mapper;
    @Mock private CurrentUser currentUser;
    @BeforeEach void identity(){lenient().when(currentUser.id()).thenReturn(UUID.fromString("00000000-0000-0000-0000-000000000001"));}
    @InjectMocks private PlaceService service;

    @Test
    void listNormalizesBlankFilters() {
        List<PlaceDto> expected = Arrays.asList(new PlaceDto());
        when(mapper.findAll(isNull(), isNull(), isNull(), any(UUID.class))).thenReturn(expected);

        assertSame(expected, service.findAll("  ", "", null));
    }

    @Test
    void rejectsReversedMapBounds() {
        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
                () -> service.findInBounds(20, 5, 10, 15));

        assertEquals(400, exception.getRawStatusCode());
        verify(mapper, never()).findInBounds(any(Double.class), any(Double.class), any(Double.class), any(Double.class), any(UUID.class));
    }

    @Test
    void createDeduplicatesAndTrimsTags() {
        PlaceDto expected = new PlaceDto();
        expected.setName("Cafe");
        when(mapper.findById(any(UUID.class), any(UUID.class))).thenReturn(expected);
        PlaceRequest request = new PlaceRequest();
        request.setName("Cafe");
        request.setCity("Hangzhou");
        request.setCategory("咖啡");
        request.setTags(Arrays.asList(" coffee ", "weekend", "coffee"));

        PlaceDto actual = service.create(request);

        assertSame(expected, actual);
        ArgumentCaptor<List<String>> tags = ArgumentCaptor.forClass(List.class);
        verify(mapper).insertTags(tags.capture(), any(UUID.class));
        assertEquals(Arrays.asList("coffee", "weekend"), tags.getValue());
        verify(mapper).linkTags(any(UUID.class), anyList(), any(UUID.class));
    }

    @Test
    void missingPlaceReturnsNotFound() {
        when(mapper.findById(any(UUID.class), any(UUID.class))).thenReturn(null);

        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
                () -> service.find(UUID.randomUUID()));

        assertEquals(404, exception.getRawStatusCode());
    }
}
