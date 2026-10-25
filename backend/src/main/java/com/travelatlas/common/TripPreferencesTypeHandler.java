package com.travelatlas.common;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.travelatlas.trips.TripPreferences;
import java.sql.*;
import org.apache.ibatis.type.*;

@MappedTypes(TripPreferences.class)
public class TripPreferencesTypeHandler extends BaseTypeHandler<TripPreferences> {
    private static final ObjectMapper JSON=new ObjectMapper();
    @Override public void setNonNullParameter(PreparedStatement ps,int index,TripPreferences value,JdbcType type)throws SQLException{
        try{ps.setObject(index,JSON.writeValueAsString(value),Types.OTHER);}catch(Exception e){throw new SQLException("Invalid trip preferences");}
    }
    private TripPreferences read(String value)throws SQLException{
        try{return value==null?new TripPreferences():JSON.readValue(value,TripPreferences.class);}catch(Exception e){throw new SQLException("Invalid stored trip preferences");}
    }
    @Override public TripPreferences getNullableResult(ResultSet rs,String name)throws SQLException{return read(rs.getString(name));}
    @Override public TripPreferences getNullableResult(ResultSet rs,int index)throws SQLException{return read(rs.getString(index));}
    @Override public TripPreferences getNullableResult(CallableStatement cs,int index)throws SQLException{return read(cs.getString(index));}
}
